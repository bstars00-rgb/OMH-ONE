import 'server-only';
import { sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { visibilitySql } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';

export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  capability: 'reports.export' | 'finance.view' | 'leave.manageAll' | 'audit.view';
}

export const REPORTS: ReportDefinition[] = [
  { key: 'approvals', name: 'Monthly Approval Report', description: 'Every request with its status, approver chain and decision time.', capability: 'reports.export' },
  { key: 'leave', name: 'Leave Report', description: 'Leave requests with working days, balance impact and approver.', capability: 'leave.manageAll' },
  { key: 'leave-balances', name: 'Leave Balance Report', description: 'Entitlement, used, pending and remaining per employee.', capability: 'leave.manageAll' },
  { key: 'travel', name: 'Business Trip Report', description: 'Trips with destination, travellers, duration and cost breakdown.', capability: 'reports.export' },
  { key: 'expenses', name: 'Expense Report', description: 'Expense lines with category, merchant, tax and reimbursement date.', capability: 'finance.view' },
  { key: 'procurement', name: 'Procurement Report', description: 'Purchase requests with vendor, items, unit price and quotations.', capability: 'finance.view' },
  { key: 'budgets', name: 'Budget Report', description: 'Allocated, committed, spent and remaining per department and category.', capability: 'finance.view' },
  { key: 'departments', name: 'Department Report', description: 'Request volume and spend per department.', capability: 'reports.export' },
  { key: 'sla', name: 'Approval SLA Report', description: 'Every approval step with SLA, elapsed time and overdue flag.', capability: 'reports.export' },
  { key: 'ai-risk', name: 'AI Risk Report', description: 'Requests with their AI risk level, recommendation and failed checks.', capability: 'reports.export' },
];

type Rows = Record<string, unknown>[];
function rowsOf(result: unknown): Rows {
  if (Array.isArray(result)) return result as Rows;
  return ((result as { rows?: unknown[] })?.rows ?? []) as Rows;
}

/**
 * Runs a preset report.
 *
 * Reports are hand-written queries selected by key — the key never reaches SQL as
 * text, so an unknown key returns null rather than executing anything.
 */
export async function runReport(session: SessionUser, key: string): Promise<Rows | null> {
  const db = await ready();
  // Every report below aliases the requests table as `r`.
  const scope = visibilitySql(session, 'r');

  switch (key) {
    case 'approvals':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, r.request_type, r.title, e.name as requester, d.code as department,
                 r.status, r.priority, r.amount_base, r.currency,
                 to_char(r.submitted_at,'YYYY-MM-DD HH24:MI') as submitted_at,
                 to_char(r.decided_at,'YYYY-MM-DD HH24:MI') as decided_at,
                 round(extract(epoch from (r.decided_at - r.submitted_at))/3600) as decision_hours,
                 (select string_agg(s.name || ': ' || coalesce(a.name,'unassigned') || ' (' || s.status || ')', ' | ' order by s.step_order)
                  from approval_steps s left join employees a on a.id = s.approver_id
                  where s.request_id = r.id) as approval_chain
          from requests r
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          where ${scope} and r.status <> 'DRAFT'
          order by r.submitted_at desc nulls last
        `),
      );

    case 'leave':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, e.name as employee, d.code as department, l.leave_type,
                 l.start_date, l.end_date, l.working_days, l.calendar_days, r.status,
                 to_char(r.submitted_at,'YYYY-MM-DD') as submitted_at,
                 coalesce(h.name, '') as handover_to
          from leave_requests l
          join requests r on r.id = l.request_id
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          left join employees h on h.id = l.handover_to
          where ${scope} and r.status <> 'DRAFT'
          order by l.start_date desc
        `),
      );

    case 'leave-balances':
      return rowsOf(
        await db.execute(sql`
          select e.employee_code, e.name as employee, d.code as department, lb.year, lb.leave_type,
                 lb.allowance, lb.carried_over, lb.used, lb.pending,
                 (lb.allowance::numeric + lb.carried_over::numeric - lb.used::numeric - lb.pending::numeric) as remaining
          from leave_balances lb
          join employees e on e.id = lb.employee_id
          left join departments d on d.id = e.department_id
          where e.status = 'ACTIVE'
          order by d.code, e.name, lb.leave_type
        `),
      );

    case 'travel':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, e.name as lead_traveller, d.code as department,
                 bt.country, bt.city, bt.start_date, bt.end_date, bt.duration_days,
                 (select count(*)::int from trip_travelers tt where tt.trip_id = bt.id) as travellers,
                 (select string_agg(te.name, '; ') from trip_travelers tt join employees te on te.id = tt.employee_id where tt.trip_id = bt.id) as traveller_names,
                 bt.hotel_nights, bt.hotel_rate_per_night, bt.total_base, r.status,
                 (select coalesce(sum(tc.amount_base),0) from trip_costs tc where tc.trip_id = bt.id and tc.category='FLIGHT') as flight_cost,
                 (select coalesce(sum(tc.amount_base),0) from trip_costs tc where tc.trip_id = bt.id and tc.category='HOTEL') as hotel_cost
          from business_trips bt
          join requests r on r.id = bt.request_id
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          where ${scope} and r.status <> 'DRAFT'
          order by bt.start_date desc
        `),
      );

    case 'expenses':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, e.name as employee, d.code as department,
                 ei.expense_date, ei.category, ei.merchant, ei.description,
                 ei.currency, ei.amount_original, ei.amount_base, ei.tax_amount,
                 ec.payment_method, r.status,
                 to_char(ec.reimbursed_at,'YYYY-MM-DD') as reimbursed_at,
                 case when ei.extracted_by_ai then 'AI' else 'Manual' end as entry_source
          from expense_items ei
          join expense_claims ec on ec.id = ei.claim_id
          join requests r on r.id = ec.request_id
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          where ${scope} and r.status <> 'DRAFT'
          order by ei.expense_date desc
        `),
      );

    case 'procurement':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, e.name as requester, d.code as department,
                 coalesce(v.name,'') as vendor, pr.category, pi.item_name, pi.quantity, pi.unit_price, pi.line_total,
                 pr.quotation_count, pr.required_date, pr.total_base, r.status,
                 to_char(r.decided_at,'YYYY-MM-DD') as decided_at
          from purchase_items pi
          join purchase_requests pr on pr.id = pi.purchase_request_id
          join requests r on r.id = pr.request_id
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          left join vendors v on v.id = pr.vendor_id
          where ${scope} and r.status <> 'DRAFT'
          order by r.submitted_at desc nulls last
        `),
      );

    case 'budgets':
      return rowsOf(
        await db.execute(sql`
          select d.code as department, b.year, b.quarter, b.category, b.allocated, b.committed, b.spent,
                 (b.allocated::numeric - b.committed::numeric - b.spent::numeric) as remaining,
                 round(((b.committed::numeric + b.spent::numeric) / nullif(b.allocated::numeric,0)) * 100) as utilization_pct
          from budgets b join departments d on d.id = b.department_id
          order by d.code, b.category
        `),
      );

    case 'departments':
      return rowsOf(
        await db.execute(sql`
          select d.code as department, d.name as department_name,
                 count(*)::int as total_requests,
                 count(*) filter (where r.status='APPROVED')::int as approved,
                 count(*) filter (where r.status='REJECTED')::int as rejected,
                 count(*) filter (where r.status in ('SUBMITTED','IN_REVIEW'))::int as in_flight,
                 coalesce(sum(r.amount_base) filter (where r.status='APPROVED'),0) as approved_spend,
                 round(avg(extract(epoch from (r.decided_at - r.submitted_at))/3600)) as avg_decision_hours
          from requests r join departments d on d.id = r.department_id
          where ${scope} and r.status <> 'DRAFT'
          group by d.code, d.name order by approved_spend desc
        `),
      );

    case 'sla':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, r.request_type, s.step_order, s.name as step_name, s.approver_role,
                 coalesce(a.name,'unassigned') as approver, s.status,
                 s.sla_hours,
                 to_char(s.started_at,'YYYY-MM-DD HH24:MI') as started_at,
                 to_char(s.due_at,'YYYY-MM-DD HH24:MI') as due_at,
                 to_char(s.completed_at,'YYYY-MM-DD HH24:MI') as completed_at,
                 round(extract(epoch from (coalesce(s.completed_at, now()) - s.started_at))/3600) as elapsed_hours,
                 case when s.completed_at is null and s.due_at < now() then 'YES' else 'NO' end as overdue
          from approval_steps s
          join requests r on r.id = s.request_id
          left join employees a on a.id = s.approver_id
          where ${scope}
          order by r.request_number, s.step_order
        `),
      );

    case 'ai-risk':
      return rowsOf(
        await db.execute(sql`
          select r.request_number, r.request_type, r.title, e.name as requester, d.code as department,
                 r.amount_base, r.status, ar.risk_level, ar.recommendation, ar.confidence, ar.provider,
                 (select count(*)::int from jsonb_array_elements(ar.checks) c where c->>'status' = 'FAIL') as failed_checks,
                 (select count(*)::int from jsonb_array_elements(ar.checks) c where c->>'status' = 'WARN') as warning_checks,
                 (select string_agg(c->>'label', '; ') from jsonb_array_elements(ar.checks) c where c->>'status' <> 'PASS') as flagged
          from ai_reviews ar
          join requests r on r.id = ar.request_id
          join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          where ${scope}
          order by case ar.risk_level when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, r.amount_base desc
        `),
      );

    default:
      return null;
  }
}

/** RFC 4180 CSV. Values are quoted and internal quotes doubled. */
export function toCsv(rows: Rows): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  // BOM so Excel opens UTF-8 correctly on Windows.
  return `﻿${lines.join('\r\n')}`;
}
