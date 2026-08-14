import 'server-only';
import { sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { visibilitySql } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import { num } from '@/lib/money';

/** Module-level aggregates. All scoped by the caller's visibility predicate. */

type Rows = Record<string, unknown>[];
function rowsOf(result: unknown): Rows {
  if (Array.isArray(result)) return result as Rows;
  return ((result as { rows?: unknown[] })?.rows ?? []) as Rows;
}

/** Every statement below aliases the requests table as `r`. */
function scope(session: SessionUser) {
  return visibilitySql(session, 'r');
}

/* ------------------------------------------------------------------ */
/* Travel                                                              */
/* ------------------------------------------------------------------ */

export async function getTravelStats(session: SessionUser) {
  const db = await ready();
  const s = scope(session);

  const [summary] = rowsOf(
    await db.execute(sql`
      with scoped as (
        select r.*, bt.id as trip_id, bt.city, bt.country, bt.start_date, bt.end_date, bt.total_base,
               (select count(*)::int from trip_travelers tt where tt.trip_id = bt.id) as travellers
        from requests r join business_trips bt on bt.request_id = r.id
        where ${s} and r.request_type = 'BUSINESS_TRIP'
      )
      select
        (select count(*)::int from scoped where start_date > current_date and status in ('APPROVED','SUBMITTED','IN_REVIEW')) as upcoming,
        (select coalesce(sum(travellers),0)::int from scoped where start_date > current_date and status in ('APPROVED','SUBMITTED','IN_REVIEW')) as travellers_upcoming,
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now())) as spend_month,
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now() - interval '1 month')) as spend_prev_month,
        (select round(avg(total_base)) from scoped where status='APPROVED' and decided_at > now() - interval '12 months') as avg_trip_cost,
        (select round(avg(total_base / greatest(1, travellers))) from scoped where status='APPROVED' and decided_at > now() - interval '12 months') as avg_per_traveller,
        (select count(*)::int from scoped where status in ('SUBMITTED','IN_REVIEW')) as pending
    `),
  );

  const byCountry = rowsOf(
    await db.execute(sql`
      select bt.country as name, coalesce(sum(bt.total_base),0) as value, count(*)::int as count
      from business_trips bt join requests r on r.id = bt.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by bt.country order by value desc limit 10
    `),
  );

  const byDepartment = rowsOf(
    await db.execute(sql`
      select d.code as name, coalesce(sum(bt.total_base),0) as value, count(*)::int as count
      from business_trips bt join requests r on r.id = bt.request_id
      join departments d on d.id = r.department_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by d.code order by value desc
    `),
  );

  const topTravellers = rowsOf(
    await db.execute(sql`
      select e.name, e.id, count(distinct bt.id)::int as trips,
             coalesce(sum(bt.total_base / greatest(1,(select count(*)::int from trip_travelers t2 where t2.trip_id=bt.id))),0) as value
      from trip_travelers tt
      join business_trips bt on bt.id = tt.trip_id
      join requests r on r.id = bt.request_id
      join employees e on e.id = tt.employee_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by e.id, e.name order by value desc limit 8
    `),
  );

  const monthly = rowsOf(
    await db.execute(sql`
      select to_char(date_trunc('month', r.decided_at),'YYYY-MM') as month,
             coalesce(sum(bt.total_base),0) as value, count(*)::int as count
      from business_trips bt join requests r on r.id = bt.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by 1 order by 1
    `),
  );

  return {
    upcoming: Number(summary?.upcoming ?? 0),
    travellersUpcoming: Number(summary?.travellers_upcoming ?? 0),
    spendMonth: num(summary?.spend_month as string),
    spendPrevMonth: num(summary?.spend_prev_month as string),
    avgTripCost: num(summary?.avg_trip_cost as string),
    avgPerTraveller: num(summary?.avg_per_traveller as string),
    pending: Number(summary?.pending ?? 0),
    byCountry: byCountry.map(toNamed),
    byDepartment: byDepartment.map(toNamed),
    topTravellers: topTravellers.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      trips: Number(r.trips),
      value: num(r.value as string),
    })),
    monthly: monthly.map((r) => ({ month: String(r.month), value: num(r.value as string), count: Number(r.count) })),
  };
}

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

export async function getLeaveStats(session: SessionUser) {
  const db = await ready();
  const s = scope(session);
  const year = new Date().getUTCFullYear();

  const balances = rowsOf(
    await db.execute(sql`
      select e.id, e.name, d.code as department, lb.leave_type,
             lb.allowance, lb.carried_over, lb.used, lb.pending
      from leave_balances lb
      join employees e on e.id = lb.employee_id
      left join departments d on d.id = e.department_id
      where lb.year = ${year} and lb.leave_type = 'ANNUAL' and e.status = 'ACTIVE'
      order by (lb.used::numeric + lb.pending::numeric) desc
    `),
  );

  const byDepartment = rowsOf(
    await db.execute(sql`
      select d.code as name, coalesce(sum(l.working_days),0) as value, count(*)::int as count
      from leave_requests l join requests r on r.id = l.request_id
      join departments d on d.id = r.department_id
      where ${s} and r.status='APPROVED' and extract(year from l.start_date) = ${year}
      group by d.code order by value desc
    `),
  );

  const monthly = rowsOf(
    await db.execute(sql`
      select to_char(date_trunc('month', l.start_date),'YYYY-MM') as month,
             coalesce(sum(l.working_days),0) as value
      from leave_requests l join requests r on r.id = l.request_id
      where ${s} and r.status='APPROVED' and l.start_date > now() - interval '12 months'
      group by 1 order by 1
    `),
  );

  return {
    balances: balances.map((r) => {
      const allowance = num(r.allowance as string) + num(r.carried_over as string);
      const used = num(r.used as string);
      const pending = num(r.pending as string);
      return {
        id: String(r.id),
        name: String(r.name),
        department: r.department ? String(r.department) : null,
        allowance,
        used,
        pending,
        remaining: allowance - used - pending,
        utilization: allowance > 0 ? (used + pending) / allowance : 0,
      };
    }),
    byDepartment: byDepartment.map(toNamed),
    monthly: monthly.map((r) => ({ month: String(r.month), value: num(r.value as string) })),
  };
}

/* ------------------------------------------------------------------ */
/* Procurement                                                         */
/* ------------------------------------------------------------------ */

export async function getProcurementStats(session: SessionUser) {
  const db = await ready();
  const s = scope(session);

  const [summary] = rowsOf(
    await db.execute(sql`
      with scoped as (
        select r.*, pr.total_base, pr.category, pr.vendor_id
        from requests r join purchase_requests pr on pr.request_id = r.id where ${s}
      )
      select
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now())) as spend_month,
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now() - interval '1 month')) as spend_prev,
        (select count(*)::int from scoped where status in ('SUBMITTED','IN_REVIEW')) as pending,
        (select coalesce(sum(total_base),0) from scoped where status in ('SUBMITTED','IN_REVIEW')) as pending_value,
        (select count(*)::int from scoped where status='APPROVED' and decided_at > now() - interval '12 months') as approved_year
    `),
  );

  const topVendors = rowsOf(
    await db.execute(sql`
      select v.name, v.id, count(*)::int as orders, coalesce(sum(pr.total_base),0) as value, v.is_preferred
      from purchase_requests pr join requests r on r.id = pr.request_id
      join vendors v on v.id = pr.vendor_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by v.id, v.name, v.is_preferred order by value desc limit 8
    `),
  );

  const byCategory = rowsOf(
    await db.execute(sql`
      select pr.category as name, coalesce(sum(pr.total_base),0) as value, count(*)::int as count
      from purchase_requests pr join requests r on r.id = pr.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by pr.category order by value desc
    `),
  );

  // Same item bought more than once — the price-drift view procurement actually wants.
  const priceHistory = rowsOf(
    await db.execute(sql`
      select pi.item_name as name, count(*)::int as purchases,
             round(min(pi.unit_price)) as min_price, round(max(pi.unit_price)) as max_price,
             round(avg(pi.unit_price)) as avg_price
      from purchase_items pi
      join purchase_requests pr on pr.id = pi.purchase_request_id
      join requests r on r.id = pr.request_id
      where ${s} and r.status='APPROVED'
      group by pi.item_name having count(*) > 1
      order by (max(pi.unit_price) - min(pi.unit_price)) desc limit 8
    `),
  );

  const monthly = rowsOf(
    await db.execute(sql`
      select to_char(date_trunc('month', r.decided_at),'YYYY-MM') as month, coalesce(sum(pr.total_base),0) as value
      from purchase_requests pr join requests r on r.id = pr.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by 1 order by 1
    `),
  );

  return {
    spendMonth: num(summary?.spend_month as string),
    spendPrev: num(summary?.spend_prev as string),
    pending: Number(summary?.pending ?? 0),
    pendingValue: num(summary?.pending_value as string),
    approvedYear: Number(summary?.approved_year ?? 0),
    topVendors: topVendors.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      orders: Number(r.orders),
      value: num(r.value as string),
      isPreferred: Boolean(r.is_preferred),
    })),
    byCategory: byCategory.map(toNamed),
    priceHistory: priceHistory.map((r) => ({
      name: String(r.name),
      purchases: Number(r.purchases),
      minPrice: num(r.min_price as string),
      maxPrice: num(r.max_price as string),
      avgPrice: num(r.avg_price as string),
    })),
    monthly: monthly.map((r) => ({ month: String(r.month), value: num(r.value as string) })),
  };
}

/* ------------------------------------------------------------------ */
/* Expense                                                             */
/* ------------------------------------------------------------------ */

export async function getExpenseStats(session: SessionUser) {
  const db = await ready();
  const s = scope(session);

  const [summary] = rowsOf(
    await db.execute(sql`
      with scoped as (
        select r.*, ec.total_base, ec.id as claim_id
        from requests r join expense_claims ec on ec.request_id = r.id where ${s}
      )
      select
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now())) as spend_month,
        (select coalesce(sum(total_base),0) from scoped where status='APPROVED' and date_trunc('month', decided_at)=date_trunc('month', now() - interval '1 month')) as spend_prev,
        (select count(*)::int from scoped where status in ('SUBMITTED','IN_REVIEW')) as pending,
        (select coalesce(sum(total_base),0) from scoped where status in ('SUBMITTED','IN_REVIEW')) as pending_value,
        (select round(avg(total_base)) from scoped where status='APPROVED' and decided_at > now() - interval '12 months') as avg_claim
    `),
  );

  const byCategory = rowsOf(
    await db.execute(sql`
      select ei.category as name, coalesce(sum(ei.amount_base),0) as value, count(*)::int as count
      from expense_items ei join expense_claims ec on ec.id = ei.claim_id
      join requests r on r.id = ec.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by ei.category order by value desc
    `),
  );

  const monthly = rowsOf(
    await db.execute(sql`
      select to_char(date_trunc('month', r.decided_at),'YYYY-MM') as month, coalesce(sum(ec.total_base),0) as value
      from expense_claims ec join requests r on r.id = ec.request_id
      where ${s} and r.status='APPROVED' and r.decided_at > now() - interval '12 months'
      group by 1 order by 1
    `),
  );

  // Receipt hashes appearing on more than one claim.
  const duplicates = rowsOf(
    await db.execute(sql`
      select ei.receipt_hash, ei.merchant, ei.expense_date, ei.amount_base,
             array_agg(distinct r.request_number) as request_numbers,
             min(r.id::text) as first_request_id
      from expense_items ei
      join expense_claims ec on ec.id = ei.claim_id
      join requests r on r.id = ec.request_id
      where ${s} and r.status <> 'CANCELED' and ei.receipt_hash is not null
      group by ei.receipt_hash, ei.merchant, ei.expense_date, ei.amount_base
      having count(distinct ec.id) > 1
      limit 10
    `),
  );

  return {
    spendMonth: num(summary?.spend_month as string),
    spendPrev: num(summary?.spend_prev as string),
    pending: Number(summary?.pending ?? 0),
    pendingValue: num(summary?.pending_value as string),
    avgClaim: num(summary?.avg_claim as string),
    byCategory: byCategory.map(toNamed),
    monthly: monthly.map((r) => ({ month: String(r.month), value: num(r.value as string) })),
    duplicates: duplicates.map((r) => ({
      merchant: r.merchant ? String(r.merchant) : 'Unknown merchant',
      date: String(r.expense_date),
      amount: num(r.amount_base as string),
      requestNumbers: (r.request_numbers as string[]) ?? [],
      firstRequestId: String(r.first_request_id),
    })),
  };
}

function toNamed(r: Record<string, unknown>) {
  return { name: String(r.name), value: num(r.value as string), count: Number(r.count ?? 0) };
}
