/** Ad-hoc data sanity check: `npx tsx scripts/inspect-data.ts` */
import { sql } from 'drizzle-orm';
import { getDb } from '../src/lib/db';

async function main() {
  const db = await getDb();
  const q = async (label: string, statement: ReturnType<typeof sql>) => {
    const rows = await db.execute(statement);
    // PGlite driver returns { rows }, postgres-js returns an array.
    const data = Array.isArray(rows) ? rows : ((rows as unknown as { rows: unknown[] }).rows ?? []);
    console.log(`\n== ${label}`);
    console.table(data);
  };

  await q('status mix', sql`select status, count(*)::int as n from requests group by status order by n desc`);
  await q('type mix', sql`select request_type, count(*)::int as n, round(sum(amount_base)) as total from requests group by request_type order by n desc`);
  await q(
    'pending steps by approver',
    sql`select e.name, e.employee_code, count(*)::int as pending
        from approval_steps s join employees e on e.id = s.approver_id
        join requests r on r.id = s.request_id
        where s.status in ('PENDING','IN_REVIEW') and r.status in ('SUBMITTED','IN_REVIEW')
        group by e.name, e.employee_code order by pending desc limit 10`,
  );
  await q(
    'monthly approved spend (last 6)',
    sql`select to_char(decided_at,'YYYY-MM') as month, round(sum(amount_base)) as spend, count(*)::int as n
        from requests where status='APPROVED' and decided_at is not null
        group by 1 order by 1 desc limit 6`,
  );
  await q(
    'spend by department (this quarter)',
    sql`select d.code, round(sum(r.amount_base)) as spend
        from requests r join departments d on d.id = r.department_id
        where r.status='APPROVED' and r.decided_at >= date_trunc('quarter', now())
        group by d.code order by spend desc`,
  );
  await q(
    'budget utilisation',
    sql`select d.code, b.category, b.allocated, b.committed, b.spent
        from budgets b join departments d on d.id=b.department_id
        order by (b.spent::numeric / nullif(b.allocated::numeric,0)) desc limit 8`,
  );
  await q(
    'leave balance sample',
    sql`select e.name, lb.allowance, lb.used, lb.pending,
        (lb.allowance::numeric + lb.carried_over::numeric - lb.used::numeric - lb.pending::numeric) as remaining
        from leave_balances lb join employees e on e.id=lb.employee_id
        where lb.leave_type='ANNUAL' order by lb.used::numeric desc limit 8`,
  );
  await q(
    'avg approval turnaround by step role (hours)',
    sql`select approver_role, round(avg(extract(epoch from (completed_at - started_at))/3600)::numeric,1) as avg_h, count(*)::int as n
        from approval_steps where completed_at is not null and started_at is not null
        group by approver_role order by avg_h desc`,
  );
  await q(
    'upcoming trips',
    sql`select bt.city, bt.country, bt.start_date, r.status, round(bt.total_base) as cost
        from business_trips bt join requests r on r.id=bt.request_id
        where bt.start_date >= current_date order by bt.start_date limit 8`,
  );
  await q('duplicate receipt candidates', sql`select receipt_hash, count(*)::int as n from expense_items where receipt_hash is not null group by receipt_hash having count(*)>1 limit 5`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
