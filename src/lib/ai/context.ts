import 'server-only';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import {
  attachments,
  businessTrips,
  departments,
  employees,
  expenseClaims,
  expenseItems,
  holidays,
  leaveBalances,
  leaveRequests,
  policies,
  purchaseItems,
  purchaseRequests,
  requests,
  tripCosts,
  tripTravelers,
  vendors,
} from '@/lib/db/schema';
import { budgetPosition } from '@/server/services/reservations';
import { eachDay, isWeekend } from '@/lib/dates';
import { num, round2 } from '@/lib/money';
import type { RequestContext } from './types';
import type { RequestType } from '@/types/domain';

/**
 * Assembles everything the AI layer is allowed to reason about.
 *
 * Call only after the caller has been authorized for this request — the context
 * deliberately contains cross-employee data (team leave collisions, peer trip
 * costs, price history) which is exactly what makes the analysis useful and
 * exactly what must not leak. This function is the boundary.
 */
export async function buildRequestContext(requestId: string): Promise<RequestContext | null> {
  const db = await ready();

  const [row] = await db
    .select({
      r: requests,
      requesterName: employees.name,
      deptCode: departments.code,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .leftJoin(departments, eq(departments.id, requests.departmentId))
    .where(eq(requests.id, requestId))
    .limit(1);

  if (!row) return null;
  const r = row.r;
  const type = r.requestType as RequestType;

  const [policyRows, budget, attachmentCount, history, chain] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.appliesTo, type), eq(policies.isActive, true))),
    budgetPosition(db, r.departmentId, type, r.submittedAt ?? new Date()),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(attachments)
      .where(eq(attachments.requestId, requestId))
      .then((x) => Number(x[0]?.n ?? 0)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where status = 'APPROVED')::int`,
        avgAmount: sql<string>`coalesce(avg(amount_base) filter (where amount_base > 0), 0)`,
      })
      .from(requests)
      .where(and(eq(requests.requesterId, r.requesterId), ne(requests.id, requestId)))
      .then((x) => x[0]),
    db.execute(sql`
      select s.name, e.name as approver_name, s.status
      from approval_steps s left join employees e on e.id = s.approver_id
      where s.request_id = ${requestId} order by s.step_order
    `),
  ]);

  /**
   * A submitted request's amount is already sitting in `budgets.committed`
   * (reserved at submission). Reporting that as "remaining" would double-count
   * it — the approver would see the position *after* their own decision and any
   * "does the budget cover this?" check would be off by the request's own value.
   * Add it back so `remaining` means "available before this decision".
   */
  const adjustedBudget =
    budget && ['SUBMITTED', 'IN_REVIEW'].includes(r.status)
      ? {
          ...budget,
          committed: round2(budget.committed - num(r.amountBase)),
          remaining: round2(budget.remaining + num(r.amountBase)),
          utilization:
            budget.allocated > 0
              ? (budget.spent + Math.max(0, budget.committed - num(r.amountBase))) / budget.allocated
              : 0,
        }
      : budget;

  const ctx: RequestContext = {
    requestId,
    requestNumber: r.requestNumber,
    requestType: type,
    title: r.title,
    description: r.description,
    status: r.status,
    amountBase: num(r.amountBase),
    currency: r.currency,
    requesterName: row.requesterName,
    requesterId: r.requesterId,
    departmentCode: row.deptCode,
    submittedAt: r.submittedAt,
    budget: adjustedBudget,
    policies: policyRows.map((p) => ({
      code: p.code,
      name: p.name,
      metric: p.metric,
      operator: p.operator,
      threshold: p.threshold === null ? null : num(p.threshold),
      thresholdText: p.thresholdText,
      severity: p.severity,
      message: p.message,
    })),
    requesterHistory: {
      totalRequests: Number(history?.total ?? 0),
      approvedRequests: Number(history?.approved ?? 0),
      avgAmount: round2(num(history?.avgAmount)),
    },
    attachmentCount,
    approvalChain: rowsOf(chain).map((c) => ({
      name: String(c.name),
      approverName: (c.approver_name as string | null) ?? null,
      status: String(c.status),
    })),
  };

  if (type === 'LEAVE') ctx.leave = await leaveContext(db, r);
  if (type === 'BUSINESS_TRIP') ctx.trip = await tripContext(db, r);
  if (type === 'PURCHASE') ctx.purchase = await purchaseContext(db, r);
  if (type === 'EXPENSE') ctx.expense = await expenseContext(db, r);

  return ctx;
}

/** PGlite returns `{ rows }`, postgres-js returns an array. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const maybe = (result as { rows?: unknown[] })?.rows;
  return (maybe ?? []) as Record<string, unknown>[];
}

type Db = Awaited<ReturnType<typeof ready>>;
type Req = typeof requests.$inferSelect;

async function leaveContext(db: Db, r: Req): Promise<RequestContext['leave']> {
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.requestId, r.id)).limit(1);
  if (!l) return undefined;

  const year = Number(String(l.startDate).slice(0, 4));

  const [balance] = await db
    .select()
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, r.requesterId),
        eq(leaveBalances.year, year),
        eq(leaveBalances.leaveType, l.leaveType),
      ),
    )
    .limit(1);

  const allowance = num(balance?.allowance) + num(balance?.carriedOver);
  const days = num(l.workingDays);

  /**
   * Once submitted, this request's own days are already inside `pending`.
   * Add them back so `balanceRemaining` means "available before this decision" —
   * otherwise every downstream figure ("balance after approval") subtracts the
   * same days twice and tells the approver the employee has less leave than they do.
   */
  const reservedHere = ['SUBMITTED', 'IN_REVIEW'].includes(r.status) ? days : 0;
  const remaining = allowance - num(balance?.used) - num(balance?.pending) + reservedHere;

  // Anyone else in the same department off during the same window.
  const collisionRows = await db
    .select({
      name: employees.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(requests, eq(requests.id, leaveRequests.requestId))
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .where(
      and(
        ne(requests.id, r.id),
        ne(requests.requesterId, r.requesterId),
        eq(employees.departmentId, r.departmentId!),
        sql`${requests.status} in ('SUBMITTED','IN_REVIEW','APPROVED')`,
        sql`${leaveRequests.startDate} <= ${l.endDate}`,
        sql`${leaveRequests.endDate} >= ${l.startDate}`,
      ),
    )
    .limit(10);

  const holidayRows = await db
    .select({ name: holidays.name, d: holidays.holidayDate })
    .from(holidays)
    .where(and(sql`${holidays.holidayDate} >= ${l.startDate}`, sql`${holidays.holidayDate} <= ${l.endDate}`));

  const workdayHolidays = holidayRows.filter((h) => !isWeekend(String(h.d))).map((h) => `${h.name} (${h.d})`);
  void eachDay;

  return {
    leaveType: l.leaveType,
    startDate: String(l.startDate),
    endDate: String(l.endDate),
    workingDays: days,
    calendarDays: l.calendarDays,
    allowance,
    balanceRemaining: round2(remaining),
    balanceAfter: round2(remaining - days),
    collisions: collisionRows.map((c) => ({ name: c.name, startDate: String(c.startDate), endDate: String(c.endDate) })),
    holidaysInRange: [...new Set(workdayHolidays)],
  };
}

async function tripContext(db: Db, r: Req): Promise<RequestContext['trip']> {
  const [t] = await db.select().from(businessTrips).where(eq(businessTrips.requestId, r.id)).limit(1);
  if (!t) return undefined;

  const [travellers, costs] = await Promise.all([
    db
      .select({ name: employees.name })
      .from(tripTravelers)
      .innerJoin(employees, eq(employees.id, tripTravelers.employeeId))
      .where(eq(tripTravelers.tripId, t.id))
      .orderBy(desc(tripTravelers.isLead)),
    db.select().from(tripCosts).where(eq(tripCosts.tripId, t.id)),
  ]);

  // Benchmark: approved trips to the same city, cost per traveller.
  const benchmark = await db.execute(sql`
    select
      avg(bt.total_base / greatest(1, (select count(*) from trip_travelers tt where tt.trip_id = bt.id))) as avg_per_traveller,
      count(*)::int as n
    from business_trips bt
    join requests rq on rq.id = bt.request_id
    where bt.city = ${t.city} and rq.status = 'APPROVED' and rq.id <> ${r.id}
  `);
  const b = rowsOf(benchmark)[0];
  const avgPerTraveller = b?.avg_per_traveller != null ? round2(Number(b.avg_per_traveller)) : null;

  // Other people travelling anywhere during the same window.
  const concurrent = await db
    .select({
      name: employees.name,
      city: businessTrips.city,
      startDate: businessTrips.startDate,
    })
    .from(businessTrips)
    .innerJoin(requests, eq(requests.id, businessTrips.requestId))
    .innerJoin(tripTravelers, eq(tripTravelers.tripId, businessTrips.id))
    .innerJoin(employees, eq(employees.id, tripTravelers.employeeId))
    .where(
      and(
        ne(requests.id, r.id),
        sql`${requests.status} in ('SUBMITTED','IN_REVIEW','APPROVED')`,
        sql`${businessTrips.startDate} <= ${t.endDate}`,
        sql`${businessTrips.endDate} >= ${t.startDate}`,
      ),
    )
    .limit(8);

  return {
    city: t.city,
    country: t.country,
    isInternational: t.isInternational,
    durationDays: t.durationDays,
    travellerCount: travellers.length || 1,
    travellerNames: travellers.map((x) => x.name),
    hotelNights: t.hotelNights,
    hotelRatePerNight: num(t.hotelRatePerNight),
    costs: costs.map((c) => ({ category: c.category, amount: num(c.amountBase) })),
    historicalAvgPerTraveller: avgPerTraveller,
    historicalTripCount: Number(b?.n ?? 0),
    concurrentTravellers: concurrent.map((c) => ({ name: c.name, city: c.city, startDate: String(c.startDate) })),
  };
}

async function purchaseContext(db: Db, r: Req): Promise<RequestContext['purchase']> {
  const [p] = await db
    .select({ pr: purchaseRequests, vendorName: vendors.name })
    .from(purchaseRequests)
    .leftJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .where(eq(purchaseRequests.requestId, r.id))
    .limit(1);
  if (!p) return undefined;

  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseRequestId, p.pr.id));
  const firstItem = items[0];

  let priorPurchases: NonNullable<RequestContext['purchase']>['priorPurchases'] = [];
  let priorAvg: number | null = null;

  if (firstItem) {
    const prior = await db
      .select({
        requestNumber: requests.requestNumber,
        date: requests.decidedAt,
        unitPrice: purchaseItems.unitPrice,
        vendorName: vendors.name,
      })
      .from(purchaseItems)
      .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseItems.purchaseRequestId))
      .innerJoin(requests, eq(requests.id, purchaseRequests.requestId))
      .leftJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
      .where(
        and(
          eq(purchaseItems.itemName, firstItem.itemName),
          eq(requests.status, 'APPROVED'),
          ne(requests.id, r.id),
        ),
      )
      .orderBy(desc(requests.decidedAt))
      .limit(5);

    priorPurchases = prior.map((x) => ({
      requestNumber: x.requestNumber,
      date: x.date ? String(x.date).slice(0, 10) : '—',
      unitPrice: num(x.unitPrice),
      vendorName: x.vendorName,
    }));
    if (priorPurchases.length) {
      priorAvg = round2(priorPurchases.reduce((s, x) => s + x.unitPrice, 0) / priorPurchases.length);
    }
  }

  return {
    category: p.pr.category,
    vendorName: p.vendorName,
    quotationCount: p.pr.quotationCount,
    items: items.map((i) => ({
      name: i.itemName,
      quantity: num(i.quantity),
      unitPrice: num(i.unitPrice),
      lineTotal: num(i.lineTotal),
    })),
    priorPurchases,
    priorAvgUnitPrice: priorAvg,
  };
}

async function expenseContext(db: Db, r: Req): Promise<RequestContext['expense']> {
  const [c] = await db.select().from(expenseClaims).where(eq(expenseClaims.requestId, r.id)).limit(1);
  if (!c) return undefined;

  const items = await db.select().from(expenseItems).where(eq(expenseItems.claimId, c.id));
  const hashes = items.map((i) => i.receiptHash).filter(Boolean) as string[];

  // Duplicate detection: the same receipt hash on a *different* claim.
  // Repeated lines inside one claim are legitimate (a split bill).
  let duplicates: NonNullable<RequestContext['expense']>['duplicates'] = [];
  if (hashes.length) {
    const dupes = await db
      .select({
        requestNumber: requests.requestNumber,
        merchant: expenseItems.merchant,
        date: expenseItems.expenseDate,
        amount: expenseItems.amountBase,
      })
      .from(expenseItems)
      .innerJoin(expenseClaims, eq(expenseClaims.id, expenseItems.claimId))
      .innerJoin(requests, eq(requests.id, expenseClaims.requestId))
      .where(
        and(
          sql`${expenseItems.receiptHash} in (${sql.join(hashes.map((h) => sql`${h}`), sql`, `)})`,
          ne(expenseClaims.id, c.id),
          sql`${requests.status} <> 'CANCELED'`,
        ),
      )
      .limit(5);
    duplicates = dupes.map((d) => ({
      requestNumber: d.requestNumber,
      merchant: d.merchant ?? 'Unknown merchant',
      date: String(d.date),
      amount: num(d.amount),
    }));
  }

  const mealItems = items.filter((i) => i.category === 'MEAL');
  const mealDays = new Set(mealItems.map((i) => String(i.expenseDate))).size || 1;
  const mealTotalPerDay = round2(mealItems.reduce((s, i) => s + num(i.amountBase), 0) / mealDays);

  let linkedTripNumber: string | null = null;
  if (c.tripRequestId) {
    const [t] = await db
      .select({ n: requests.requestNumber })
      .from(requests)
      .where(eq(requests.id, c.tripRequestId))
      .limit(1);
    linkedTripNumber = t?.n ?? null;
  }

  return {
    paymentMethod: c.paymentMethod,
    items: items.map((i) => ({
      category: i.category,
      merchant: i.merchant,
      amount: num(i.amountBase),
      date: String(i.expenseDate),
    })),
    mealTotalPerDay,
    duplicates,
    linkedTripNumber,
  };
}
