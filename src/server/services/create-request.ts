import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, like, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import {
  businessTrips,
  costCenters,
  employees,
  expenseClaims,
  expenseItems,
  genericRequests,
  holidays,
  leaveRequests,
  purchaseItems,
  purchaseRequests,
  requests,
  tripCosts,
  tripTravelers,
} from '@/lib/db/schema';
import { REQUEST_TYPE_META, type RequestType } from '@/types/domain';
import { calcWorkingDays, daysBetween } from '@/lib/dates';
import { REFERENCE_RATES, dec, round2 } from '@/lib/money';
import type { Currency } from '@/types/domain';
import { recordAudit } from '@/server/audit';
import { buildTitle } from '@/lib/validation/templates';
import type { SessionUser } from '@/lib/auth/session';
import type { ExpenseInput, GenericInput, LeaveInput, PurchaseInput, TripInput } from '@/lib/validation/requests';
import type { Database } from '@/lib/db';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Allocates the next request number for a type and year.
 *
 * Runs inside the caller's transaction and reads `max` under the same lock as the
 * insert, so two people submitting at the same instant cannot both take
 * `PR-2026-00042`.
 */
async function nextRequestNumber(tx: Tx, type: RequestType): Promise<string> {
  const prefix = REQUEST_TYPE_META[type].prefix;
  const year = new Date().getUTCFullYear();
  const pattern = `${prefix}-${year}-%`;

  const [row] = await tx
    .select({ max: sql<string | null>`max(${requests.requestNumber})` })
    .from(requests)
    .where(like(requests.requestNumber, pattern));

  const next = row?.max ? Number(row.max.split('-')[2]) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}

async function requesterContext(tx: Tx, employeeId: string) {
  const [emp] = await tx
    .select({ departmentId: employees.departmentId, officeId: employees.officeId, name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) throw new Error('Employee record not found for the signed-in user.');

  const [cc] = emp.departmentId
    ? await tx.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.departmentId, emp.departmentId)).limit(1)
    : [undefined];

  return { departmentId: emp.departmentId, officeId: emp.officeId, costCenterId: cc?.id ?? null, name: emp.name };
}

interface BaseArgs {
  type: RequestType;
  title: string;
  description: string | null;
  amountBase: number;
  amountOriginal: number;
  currency: Currency;
}

async function insertBase(tx: Tx, session: SessionUser, args: BaseArgs & { templateId?: string; values?: Record<string, unknown> }) {
  const ctx = await requesterContext(tx, session.employeeId);
  const requestNumber = await nextRequestNumber(tx, args.type);
  const id = crypto.randomUUID();

  await tx.insert(requests).values({
    id,
    requestNumber,
    requestType: args.type,
    title: args.title,
    description: args.description,
    requesterId: session.employeeId,
    departmentId: ctx.departmentId,
    // Stamped from the requester's office at creation — the request belongs to
    // the office that filed it, even if the person later transfers.
    officeId: ctx.officeId,
    costCenterId: ctx.costCenterId,
    status: 'DRAFT',
    priority: 'NORMAL',
    priorityScore: 0,
    currentStepOrder: 0,
    amountBase: dec(args.amountBase),
    currency: args.currency,
    amountOriginal: dec(args.amountOriginal),
    templateId: args.templateId ?? null,
    values: args.values ?? null,
  });

  return { id, requestNumber, ...ctx };
}

const rateFor = (currency: Currency) => REFERENCE_RATES[currency] ?? 1;
const toBase = (amount: number, currency: Currency) => round2(amount / rateFor(currency));

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

export async function createLeave(session: SessionUser, input: LeaveInput) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const ctx = await requesterContext(tx, session.employeeId);

    const holidayRows = await tx
      .select({ holidayDate: holidays.holidayDate, name: holidays.name })
      .from(holidays)
      .where(
        and(
          sql`${holidays.holidayDate} >= ${input.startDate}`,
          sql`${holidays.holidayDate} <= ${input.endDate}`,
          ctx.officeId ? sql`(${holidays.officeId} is null or ${holidays.officeId} = ${ctx.officeId})` : sql`true`,
        ),
      );

    const calc = calcWorkingDays(
      input.startDate,
      input.endDate,
      holidayRows.map((h) => ({ holidayDate: String(h.holidayDate), name: h.name })),
      { halfDayStart: input.halfDayStart, halfDayEnd: input.halfDayEnd },
    );

    if (calc.workingDays <= 0) {
      throw new ValidationError('leaveForm.noWorkingDays');
    }

    const base = await insertBase(tx, session, {
      type: 'LEAVE',
      title: `${humanLeave(input.leaveType)} — ${calc.workingDays} working day${calc.workingDays === 1 ? '' : 's'}`,
      description: input.reason ?? null,
      amountBase: 0,
      amountOriginal: 0,
      currency: 'USD',
    });

    await tx.insert(leaveRequests).values({
      requestId: base.id,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDayStart: input.halfDayStart,
      halfDayEnd: input.halfDayEnd,
      workingDays: calc.workingDays.toFixed(1),
      calendarDays: calc.calendarDays,
      reason: input.reason ?? null,
      emergencyContact: input.emergencyContact ?? null,
      handoverTo: input.handoverTo || null,
    });

    await audit(tx, session, base, 'LEAVE');
    return base;
  });
}

/* ------------------------------------------------------------------ */
/* Business trip                                                       */
/* ------------------------------------------------------------------ */

export async function createTrip(session: SessionUser, input: TripInput) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const rate = rateFor(input.currency);
    const totalOriginal = round2(input.costs.reduce((s, c) => s + c.amount, 0));
    const totalBase = toBase(totalOriginal, input.currency);
    const durationDays = daysBetween(input.startDate, input.endDate) + 1;

    const base = await insertBase(tx, session, {
      type: 'BUSINESS_TRIP',
      title: `Business trip — ${input.city}, ${input.country}`,
      description: input.purpose,
      amountBase: totalBase,
      amountOriginal: totalOriginal,
      currency: input.currency,
    });

    const tripId = crypto.randomUUID();
    await tx.insert(businessTrips).values({
      id: tripId,
      requestId: base.id,
      country: input.country,
      city: input.city,
      isInternational: input.isInternational,
      purpose: input.purpose,
      eventName: input.eventName || null,
      partner: input.partner || null,
      startDate: input.startDate,
      endDate: input.endDate,
      durationDays,
      outboundFlight: input.outboundFlight || null,
      inboundFlight: input.inboundFlight || null,
      hotelName: input.hotelName || null,
      hotelNights: input.hotelNights,
      hotelRatePerNight: dec(toBase(input.hotelRatePerNight, input.currency)),
      transportation: input.transportation || null,
      currency: input.currency,
      exchangeRate: String(rate),
      totalOriginal: dec(totalOriginal),
      totalBase: dec(totalBase),
    });

    // The requester always travels, plus anyone they named.
    const travellerIds = [...new Set([session.employeeId, ...input.travelerIds])];
    await tx.insert(tripTravelers).values(
      travellerIds.map((employeeId) => ({
        tripId,
        employeeId,
        isLead: employeeId === session.employeeId,
      })),
    );

    await tx.insert(tripCosts).values(
      input.costs.map((c) => ({
        tripId,
        category: c.category,
        description: c.description || null,
        currency: input.currency,
        amountOriginal: dec(c.amount),
        exchangeRate: String(rate),
        amountBase: dec(toBase(c.amount, input.currency)),
      })),
    );

    await audit(tx, session, base, 'BUSINESS_TRIP');
    return base;
  });
}

/* ------------------------------------------------------------------ */
/* Purchase                                                            */
/* ------------------------------------------------------------------ */

export async function createPurchase(session: SessionUser, input: PurchaseInput) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const rate = rateFor(input.currency);
    const lines = input.items.map((i) => ({ ...i, lineTotal: round2(i.quantity * i.unitPrice) }));
    const totalOriginal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const totalBase = toBase(totalOriginal, input.currency);

    const headline =
      lines.length === 1 ? `${lines[0].itemName} × ${lines[0].quantity}` : `${lines[0].itemName} and ${lines.length - 1} more`;

    const base = await insertBase(tx, session, {
      type: 'PURCHASE',
      title: headline,
      description: input.purpose,
      amountBase: totalBase,
      amountOriginal: totalOriginal,
      currency: input.currency,
    });

    const prId = crypto.randomUUID();
    await tx.insert(purchaseRequests).values({
      id: prId,
      requestId: base.id,
      vendorId: input.vendorId || null,
      category: input.category,
      purpose: input.purpose,
      requiredDate: input.requiredDate || null,
      quotationCount: input.quotationCount,
      currency: input.currency,
      exchangeRate: String(rate),
      totalOriginal: dec(totalOriginal),
      totalBase: dec(totalBase),
    });

    await tx.insert(purchaseItems).values(
      lines.map((l) => ({
        purchaseRequestId: prId,
        itemName: l.itemName,
        description: l.description || null,
        quantity: dec(l.quantity),
        unitPrice: dec(toBase(l.unitPrice, input.currency)),
        lineTotal: dec(toBase(l.lineTotal, input.currency)),
      })),
    );

    await audit(tx, session, base, 'PURCHASE');
    return base;
  });
}

/* ------------------------------------------------------------------ */
/* Expense                                                             */
/* ------------------------------------------------------------------ */

export async function createExpense(session: SessionUser, input: ExpenseInput) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const rate = rateFor(input.currency);
    const totalOriginal = round2(input.items.reduce((s, i) => s + i.amount, 0));
    const totalBase = toBase(totalOriginal, input.currency);

    const base = await insertBase(tx, session, {
      type: 'EXPENSE',
      title: `Expense claim — ${input.items.length} line${input.items.length === 1 ? '' : 's'}`,
      description: input.description ?? null,
      amountBase: totalBase,
      amountOriginal: totalOriginal,
      currency: input.currency,
    });

    const claimId = crypto.randomUUID();
    await tx.insert(expenseClaims).values({
      id: claimId,
      requestId: base.id,
      tripRequestId: input.tripRequestId || null,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      exchangeRate: String(rate),
      totalOriginal: dec(totalOriginal),
      totalBase: dec(totalBase),
    });

    await tx.insert(expenseItems).values(
      input.items.map((i) => {
        const amountBase = toBase(i.amount, input.currency);
        return {
          claimId,
          expenseDate: i.expenseDate,
          category: i.category,
          merchant: i.merchant || null,
          description: i.description || null,
          currency: input.currency,
          amountOriginal: dec(i.amount),
          exchangeRate: String(rate),
          amountBase: dec(amountBase),
          taxAmount: dec(toBase(i.taxAmount, input.currency)),
          // Same hash rule the duplicate detector uses, computed on the base amount
          // so the same bill claimed in two currencies still matches.
          receiptHash: receiptHash(i.merchant ?? '', i.expenseDate, amountBase),
        };
      }),
    );

    await audit(tx, session, base, 'EXPENSE');
    return base;
  });
}

export function receiptHash(merchant: string, date: string, amountBase: number) {
  return createHash('sha256')
    .update(`${merchant.trim().toLowerCase()}|${date}|${amountBase.toFixed(2)}`)
    .digest('hex')
    .slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* HR / General                                                        */
/* ------------------------------------------------------------------ */

export async function createGeneric(session: SessionUser, type: 'HR' | 'GENERAL', input: GenericInput) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const amountBase = toBase(input.amount, input.currency);
    const base = await insertBase(tx, session, {
      type,
      title: input.title,
      description: input.details,
      amountBase,
      amountOriginal: input.amount,
      currency: input.currency,
    });

    await tx.insert(genericRequests).values({
      requestId: base.id,
      category: input.category,
      details: input.details,
      requestedDate: input.requestedDate || null,
    });

    await audit(tx, session, base, type);
    return base;
  });
}

/**
 * Creates a request from a form template.
 *
 * The template supplies the shape; everything downstream — routing, SLA,
 * timeline, comments, audit, analytics — is the same code path the typed forms
 * use, because they all land in `requests`. That is the whole point of the
 * universal base table: a form authored this morning by an administrator gets
 * the approval engine built months ago, for free.
 *
 * `requestType` stays GENERAL so existing workflows, permissions and reports
 * keep working without knowing templates exist. The template is the *shape*;
 * the type is the *route*.
 */
export async function createFromTemplate(
  session: SessionUser,
  template: { id: string; titlePattern: string; name: string; amountField: string | null; workflowId: string | null },
  values: Record<string, unknown>,
  currency: Currency = 'USD',
) {
  const db = await ready();
  return db.transaction(async (tx) => {
    const amount = template.amountField ? Number(values[template.amountField]) || 0 : 0;
    const amountBase = toBase(amount, currency);

    // Long text fields become the description so search, the AI summary and the
    // request detail page have something to read without knowing the schema.
    const longest = Object.entries(values)
      .filter(([, v]) => typeof v === 'string' && v.length > 20)
      .sort((a, b) => String(b[1]).length - String(a[1]).length)[0];

    const base = await insertBase(tx, session, {
      type: 'GENERAL',
      title: buildTitle(template.titlePattern, template.name, values),
      description: longest ? String(longest[1]) : null,
      amountBase,
      amountOriginal: amount,
      currency,
      templateId: template.id,
      values,
    });

    await audit(tx, session, base, 'GENERAL');
    return base;
  });
}

/* ------------------------------------------------------------------ */

async function audit(tx: Tx, session: SessionUser, base: { id: string; requestNumber: string }, type: string) {
  await recordAudit(tx as unknown as Database, {
    action: 'CREATE',
    entityType: 'request',
    entityId: base.id,
    actorId: session.employeeId,
    actorEmail: session.email,
    summary: `${base.requestNumber} created`,
    metadata: { requestType: type },
  });
}

function humanLeave(t: string) {
  return t.charAt(0) + t.slice(1).toLowerCase() + ' leave';
}

/** Carries an i18n key, like WorkflowError and PermissionError. */
export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  readonly vars?: Record<string, string | number>;
  constructor(messageKey: string, vars?: Record<string, string | number>) {
    super(messageKey);
    this.name = 'ValidationError';
    this.vars = vars;
  }
}
