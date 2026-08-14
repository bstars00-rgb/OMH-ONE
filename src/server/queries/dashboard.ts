import 'server-only';
import { and, sql, type SQL } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { requests } from '@/lib/db/schema';
import { can, requestVisibility, visibilitySql } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import { lastNMonths, monthLabel } from '@/lib/dates';
import { num } from '@/lib/money';

/**
 * Dashboard aggregates.
 *
 * Every figure is scoped by the caller's `requestVisibility` predicate, so an
 * employee's "monthly spend" tile is their own spend and a director's is the
 * company's — the same component, different denominator, no separate code path.
 */

type Rows = Record<string, unknown>[];
function rowsOf(result: unknown): Rows {
  if (Array.isArray(result)) return result as Rows;
  return ((result as { rows?: unknown[] })?.rows ?? []) as Rows;
}

/**
 * The visibility predicate as raw SQL. Every hand-written aggregate below aliases
 * the requests table as `r`, so the predicate has to be emitted against that alias.
 */
function scopeSql(session: SessionUser): SQL {
  return visibilitySql(session, 'r');
}

export interface DashboardStats {
  pendingForMe: number;
  overdueForMe: number;
  requestsThisMonth: number;
  requestsLastMonth: number;
  spendThisMonth: number;
  spendLastMonth: number;
  onLeaveToday: number;
  activeTrips: number;
  upcomingTrips: number;
  pendingPurchase: number;
  pendingPurchaseValue: number;
  avgApprovalHours: number | null;
  slaOverdue: number;
  myOpenRequests: number;
  myReturnedRequests: number;
}

export async function getDashboardStats(session: SessionUser): Promise<DashboardStats> {
  const db = await ready();
  const scope = scopeSql(session);

  const result = await db.execute(sql`
    with scoped as (
      select r.* from requests r where ${scope}
    ),
    my_steps as (
      select s.*, r.status as request_status
      from approval_steps s
      join requests r on r.id = s.request_id
      where s.approver_id = ${session.employeeId}
        and s.status in ('PENDING','IN_REVIEW')
        and s.step_order = r.current_step_order
        and r.status in ('SUBMITTED','IN_REVIEW')
    )
    select
      (select count(*)::int from my_steps) as pending_for_me,
      (select count(*)::int from my_steps where due_at < now()) as overdue_for_me,
      (select count(*)::int from scoped
        where date_trunc('month', coalesce(submitted_at, created_at)) = date_trunc('month', now())) as requests_this_month,
      (select count(*)::int from scoped
        where date_trunc('month', coalesce(submitted_at, created_at)) = date_trunc('month', now() - interval '1 month')) as requests_last_month,
      (select coalesce(sum(amount_base), 0) from scoped
        where status = 'APPROVED' and date_trunc('month', decided_at) = date_trunc('month', now())) as spend_this_month,
      (select coalesce(sum(amount_base), 0) from scoped
        where status = 'APPROVED' and date_trunc('month', decided_at) = date_trunc('month', now() - interval '1 month')) as spend_last_month,
      (select count(distinct s.requester_id)::int
        from scoped s join leave_requests l on l.request_id = s.id
        where s.status = 'APPROVED' and current_date between l.start_date and l.end_date) as on_leave_today,
      (select count(*)::int from scoped s join business_trips b on b.request_id = s.id
        where s.status = 'APPROVED' and current_date between b.start_date and b.end_date) as active_trips,
      (select count(*)::int from scoped s join business_trips b on b.request_id = s.id
        where s.status in ('APPROVED','SUBMITTED','IN_REVIEW') and b.start_date > current_date
          and b.start_date <= current_date + interval '30 days') as upcoming_trips,
      (select count(*)::int from scoped where request_type = 'PURCHASE' and status in ('SUBMITTED','IN_REVIEW')) as pending_purchase,
      (select coalesce(sum(amount_base), 0) from scoped where request_type = 'PURCHASE' and status in ('SUBMITTED','IN_REVIEW')) as pending_purchase_value,
      (select round(avg(extract(epoch from (st.completed_at - st.started_at)) / 3600)::numeric, 1)
        from approval_steps st join scoped s on s.id = st.request_id
        where st.completed_at is not null and st.started_at is not null
          and st.completed_at > now() - interval '90 days') as avg_approval_hours,
      (select count(*)::int from approval_steps st join scoped s on s.id = st.request_id
        where st.status in ('PENDING','IN_REVIEW') and st.due_at < now()
          and s.status in ('SUBMITTED','IN_REVIEW') and st.step_order = s.current_step_order) as sla_overdue,
      (select count(*)::int from requests where requester_id = ${session.employeeId}
        and status in ('SUBMITTED','IN_REVIEW')) as my_open_requests,
      (select count(*)::int from requests where requester_id = ${session.employeeId}
        and status = 'RETURNED') as my_returned_requests
  `);

  const r = rowsOf(result)[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);

  return {
    pendingForMe: n('pending_for_me'),
    overdueForMe: n('overdue_for_me'),
    requestsThisMonth: n('requests_this_month'),
    requestsLastMonth: n('requests_last_month'),
    spendThisMonth: num(r.spend_this_month as string),
    spendLastMonth: num(r.spend_last_month as string),
    onLeaveToday: n('on_leave_today'),
    activeTrips: n('active_trips'),
    upcomingTrips: n('upcoming_trips'),
    pendingPurchase: n('pending_purchase'),
    pendingPurchaseValue: num(r.pending_purchase_value as string),
    avgApprovalHours: r.avg_approval_hours == null ? null : Number(r.avg_approval_hours),
    slaOverdue: n('sla_overdue'),
    myOpenRequests: n('my_open_requests'),
    myReturnedRequests: n('my_returned_requests'),
  };
}

/* ------------------------------------------------------------------ */
/* Chart series                                                        */
/* ------------------------------------------------------------------ */

export interface StatusSlice {
  status: string;
  count: number;
}

export async function getStatusMix(session: SessionUser): Promise<StatusSlice[]> {
  const db = await ready();
  const rows = await db
    .select({ status: requests.status, n: sql<number>`count(*)::int` })
    .from(requests)
    .where(and(requestVisibility(session), sql`coalesce(${requests.submittedAt}, ${requests.createdAt}) > now() - interval '6 months'`))
    .groupBy(requests.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.n) }));
}

export interface TrendPoint {
  month: string;
  label: string;
  submitted: number;
  approved: number;
  rejected: number;
  spend: number;
}

export async function getApprovalTrend(session: SessionUser, months = 6): Promise<TrendPoint[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select
      to_char(date_trunc('month', coalesce(submitted_at, created_at)), 'YYYY-MM') as month,
      count(*)::int as submitted,
      count(*) filter (where status = 'APPROVED')::int as approved,
      count(*) filter (where status = 'REJECTED')::int as rejected,
      coalesce(sum(amount_base) filter (where status = 'APPROVED'), 0) as spend
    from requests r
    where ${scopeSql(session)}
      and coalesce(submitted_at, created_at) > date_trunc('month', now()) - interval '${sql.raw(String(months - 1))} months'
    group by 1 order by 1
  `);

  const map = new Map(rowsOf(result).map((r) => [String(r.month), r]));
  return lastNMonths(months).map((key) => {
    const r = map.get(key);
    return {
      month: key,
      label: monthLabel(key),
      submitted: Number(r?.submitted ?? 0),
      approved: Number(r?.approved ?? 0),
      rejected: Number(r?.rejected ?? 0),
      spend: num(r?.spend as string),
    };
  });
}

export interface NamedValue {
  name: string;
  value: number;
  count?: number;
}

export async function getSpendByDepartment(session: SessionUser, months = 3): Promise<NamedValue[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select d.code as name, coalesce(sum(r.amount_base), 0) as value, count(*)::int as count
    from requests r join departments d on d.id = r.department_id
    where ${scopeSql(session)} and r.status = 'APPROVED'
      and r.decided_at > now() - interval '${sql.raw(String(months))} months'
    group by d.code having sum(r.amount_base) > 0 order by value desc
  `);
  return rowsOf(result).map((r) => ({ name: String(r.name), value: num(r.value as string), count: Number(r.count) }));
}

export async function getSpendByCategory(session: SessionUser, months = 3): Promise<NamedValue[]> {
  const db = await ready();
  // Expense lines carry a real category; other request types map to their own kind
  // of spend, so the chart covers all money rather than only expense claims.
  const result = await db.execute(sql`
    with scoped as (select r.* from requests r where ${scopeSql(session)} and r.status = 'APPROVED'
      and r.decided_at > now() - interval '${sql.raw(String(months))} months')
    select category as name, sum(amount) as value, count(*)::int as count from (
      select ei.category, ei.amount_base as amount
      from expense_items ei
      join expense_claims ec on ec.id = ei.claim_id
      join scoped s on s.id = ec.request_id
      union all
      select tc.category, tc.amount_base
      from trip_costs tc join business_trips bt on bt.id = tc.trip_id join scoped s on s.id = bt.request_id
      union all
      select pr.category, pr.total_base
      from purchase_requests pr join scoped s on s.id = pr.request_id
    ) x group by category having sum(amount) > 0 order by value desc limit 10
  `);
  return rowsOf(result).map((r) => ({ name: String(r.name), value: num(r.value as string), count: Number(r.count) }));
}

export async function getLeaveMix(session: SessionUser): Promise<NamedValue[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select l.leave_type as name, sum(l.working_days) as value, count(*)::int as count
    from leave_requests l join requests r on r.id = l.request_id
    where ${scopeSql(session)} and r.status = 'APPROVED'
      and extract(year from l.start_date) = extract(year from current_date)
    group by l.leave_type order by value desc
  `);
  return rowsOf(result).map((r) => ({ name: String(r.name), value: num(r.value as string), count: Number(r.count) }));
}

export interface BottleneckRow {
  role: string;
  avgHours: number;
  completed: number;
  overdue: number;
}

export async function getBottlenecks(session: SessionUser): Promise<BottleneckRow[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select
      st.approver_role as role,
      round(avg(extract(epoch from (st.completed_at - st.started_at)) / 3600)::numeric, 1) as avg_hours,
      count(*) filter (where st.completed_at is not null)::int as completed,
      (select count(*)::int from approval_steps o join requests r2 on r2.id = o.request_id
        where o.approver_role = st.approver_role and o.status in ('PENDING','IN_REVIEW')
          and o.due_at < now() and o.step_order = r2.current_step_order) as overdue
    from approval_steps st join requests r on r.id = st.request_id
    where ${scopeSql(session)} and st.completed_at is not null and st.started_at is not null
      and st.completed_at > now() - interval '6 months'
    group by st.approver_role order by avg_hours desc
  `);
  return rowsOf(result).map((r) => ({
    role: String(r.role),
    avgHours: Number(r.avg_hours ?? 0),
    completed: Number(r.completed ?? 0),
    overdue: Number(r.overdue ?? 0),
  }));
}

export interface TripSummary {
  requestId: string;
  requestNumber: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  status: string;
  travellers: number;
  cost: number;
  leadName: string;
}

export async function getUpcomingTrips(session: SessionUser, limit = 6): Promise<TripSummary[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select r.id as request_id, r.request_number, bt.city, bt.country, bt.start_date, bt.end_date,
           r.status, bt.total_base as cost, e.name as lead_name,
           (select count(*)::int from trip_travelers tt where tt.trip_id = bt.id) as travellers
    from business_trips bt
    join requests r on r.id = bt.request_id
    join employees e on e.id = r.requester_id
    where ${scopeSql(session)} and bt.start_date >= current_date
      and r.status in ('APPROVED','SUBMITTED','IN_REVIEW')
    order by bt.start_date limit ${limit}
  `);
  return rowsOf(result).map((r) => ({
    requestId: String(r.request_id),
    requestNumber: String(r.request_number),
    city: String(r.city),
    country: String(r.country),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    status: String(r.status),
    travellers: Number(r.travellers ?? 1),
    cost: num(r.cost as string),
    leadName: String(r.lead_name),
  }));
}

export interface LeaveToday {
  employeeName: string;
  departmentCode: string | null;
  startDate: string;
  endDate: string;
  leaveType: string;
}

export async function getTeamLeave(session: SessionUser, days = 14): Promise<LeaveToday[]> {
  const db = await ready();
  const result = await db.execute(sql`
    select e.name as employee_name, d.code as department_code, l.start_date, l.end_date, l.leave_type
    from leave_requests l
    join requests r on r.id = l.request_id
    join employees e on e.id = r.requester_id
    left join departments d on d.id = e.department_id
    where ${scopeSql(session)} and r.status in ('APPROVED','SUBMITTED','IN_REVIEW')
      and l.end_date >= current_date and l.start_date <= current_date + interval '${sql.raw(String(days))} days'
    order by l.start_date limit 12
  `);
  return rowsOf(result).map((r) => ({
    employeeName: String(r.employee_name),
    departmentCode: r.department_code ? String(r.department_code) : null,
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    leaveType: String(r.leave_type),
  }));
}

export interface BudgetRow {
  departmentCode: string;
  category: string;
  allocated: number;
  committed: number;
  spent: number;
  remaining: number;
  utilization: number;
}

export async function getBudgetPositions(session: SessionUser): Promise<BudgetRow[]> {
  const db = await ready();
  const restrictToOwn = !can(session, 'finance.view') && !can(session, 'analytics.company');
  const deptFilter =
    restrictToOwn && session.departmentId ? sql`and b.department_id = ${session.departmentId}` : sql``;

  const result = await db.execute(sql`
    select d.code as department_code, b.category, b.allocated, b.committed, b.spent
    from budgets b join departments d on d.id = b.department_id
    where b.year = extract(year from current_date)
      and b.quarter = extract(quarter from current_date)
      ${deptFilter}
    order by (b.spent::numeric + b.committed::numeric) / nullif(b.allocated::numeric, 0) desc
  `);

  return rowsOf(result).map((r) => {
    const allocated = num(r.allocated as string);
    const committed = num(r.committed as string);
    const spent = num(r.spent as string);
    return {
      departmentCode: String(r.department_code),
      category: String(r.category),
      allocated,
      committed,
      spent,
      remaining: allocated - committed - spent,
      utilization: allocated > 0 ? (committed + spent) / allocated : 0,
    };
  });
}

/** Requests needing this person's attention right now, highest priority first. */
export async function getAttentionItems(session: SessionUser, limit = 6) {
  const db = await ready();
  const result = await db.execute(sql`
    select r.id, r.request_number, r.title, r.request_type, r.amount_base, r.priority, r.due_at, r.status,
           case when r.due_at is null then null
                else round((extract(epoch from (r.due_at - now())) / 3600)::numeric, 2) end as hours_to_due,
           e.name as requester_name,
           (select ar.risk_level from ai_reviews ar where ar.request_id = r.id order by ar.created_at desc limit 1) as risk
    from requests r
    join employees e on e.id = r.requester_id
    join approval_steps s on s.request_id = r.id and s.step_order = r.current_step_order
    where s.approver_id = ${session.employeeId}
      and s.status in ('PENDING','IN_REVIEW')
      and r.status in ('SUBMITTED','IN_REVIEW')
    order by r.priority_score desc, s.due_at asc nulls last
    limit ${limit}
  `);
  return rowsOf(result).map((r) => ({
    id: String(r.id),
    requestNumber: String(r.request_number),
    title: String(r.title),
    requestType: String(r.request_type),
    amountBase: num(r.amount_base as string),
    priority: String(r.priority),
    dueAt: r.due_at ? new Date(String(r.due_at)) : null,
    hoursToDue: r.hours_to_due === null || r.hours_to_due === undefined ? null : Number(r.hours_to_due),
    status: String(r.status),
    requesterName: String(r.requester_name),
    risk: r.risk ? String(r.risk) : null,
  }));
}
