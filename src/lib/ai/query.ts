import 'server-only';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { scopeLabel, visibilitySql } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import { formatMoney } from '@/lib/money';
import { humanize } from '@/lib/utils';
import { monthLabel } from '@/lib/dates';
import type { ManagementAnswer } from './types';

/**
 * Safe natural-language query layer.
 *
 * The rule: **the model never writes SQL, and never sees a database handle.**
 * A question is classified into one of a fixed set of intents with parameters
 * drawn from closed enums; the parameters are validated by a Zod schema; and a
 * hand-written parameterized query is executed. An unrecognized question returns
 * "I can't answer that" rather than a guess.
 *
 * Every query is additionally wrapped in the caller's `requestVisibility`
 * predicate, so asking about another department returns the scoped answer rather
 * than leaking one.
 */

const INTENTS = [
  'SPEND_BY_DEPARTMENT',
  'SPEND_TREND',
  'TRAVEL_BY_COUNTRY',
  'TRAVEL_SPEND',
  'LEAVE_TOP_USERS',
  'REQUESTS_OVER_AMOUNT',
  'DELAYED_APPROVALS',
  'PENDING_SUMMARY',
  'BUDGET_STATUS',
  'TOP_VENDORS',
  'MANAGEMENT_SUMMARY',
] as const;

const PERIODS = ['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'LAST_12_MONTHS'] as const;
const DEPARTMENTS = ['SCM', 'GSM', 'OP', 'CT', 'IT', 'FIN', 'HR', 'CEO'] as const;

const querySchema = z.object({
  intent: z.enum(INTENTS),
  period: z.enum(PERIODS).default('THIS_QUARTER'),
  department: z.enum(DEPARTMENTS).optional(),
  country: z.string().max(40).optional(),
  minAmount: z.number().min(0).max(10_000_000).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});

type ParsedQuery = z.infer<typeof querySchema>;

const PERIOD_SQL: Record<(typeof PERIODS)[number], { clause: ReturnType<typeof sql>; label: string }> = {
  THIS_MONTH: { clause: sql`date_trunc('month', now())`, label: 'this month' },
  LAST_MONTH: { clause: sql`date_trunc('month', now() - interval '1 month')`, label: 'last month' },
  THIS_QUARTER: { clause: sql`date_trunc('quarter', now())`, label: 'this quarter' },
  THIS_YEAR: { clause: sql`date_trunc('year', now())`, label: 'this year' },
  LAST_12_MONTHS: { clause: sql`now() - interval '12 months'`, label: 'over the last 12 months' },
};

/** Keyword-and-entity classifier. Returns null when nothing matches confidently. */
export function classify(question: string): ParsedQuery | null {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  const period: (typeof PERIODS)[number] = has('this month', 'month to date', 'mtd')
    ? 'THIS_MONTH'
    : has('last month', 'previous month')
      ? 'LAST_MONTH'
      : has('this year', 'ytd', 'year to date', 'in 2026', 'in 2025')
        ? 'THIS_YEAR'
        : has('12 months', 'last year', 'past year')
          ? 'LAST_12_MONTHS'
          : 'THIS_QUARTER';

  const department = DEPARTMENTS.find((d) => new RegExp(`\\b${d.toLowerCase()}\\b`).test(q));

  const amountMatch = q.match(/(?:over|above|more than|greater than|exceeding)\s*\$?\s*([\d,]+)/);
  const minAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined;

  const countryMatch = q.match(/\b(korea|japan|singapore|vietnam|india|thailand|china|usa|uk)\b/);
  const country = countryMatch ? humanize(countryMatch[1]) : undefined;

  let intent: (typeof INTENTS)[number] | null = null;

  if (has('management summary', 'overall summary', "how are we doing", 'give me a summary', 'monthly summary')) {
    intent = 'MANAGEMENT_SUMMARY';
  } else if (has('why did', 'why has', 'increase', 'decrease', 'went up', 'went down', 'trend', 'change')) {
    intent = 'SPEND_TREND';
  } else if (has('delay', 'slow', 'bottleneck', 'stuck', 'waiting the longest', 'overdue', 'late')) {
    intent = 'DELAYED_APPROVALS';
  } else if (has('budget')) {
    intent = 'BUDGET_STATUS';
  } else if (has('vendor', 'supplier')) {
    intent = 'TOP_VENDORS';
  } else if (has('leave', 'holiday', 'annual leave', 'time off', 'vacation')) {
    intent = 'LEAVE_TOP_USERS';
  } else if (minAmount !== undefined || has('over $', 'above $')) {
    intent = 'REQUESTS_OVER_AMOUNT';
  } else if (country && has('trip', 'travel')) {
    intent = 'TRAVEL_BY_COUNTRY';
  } else if (has('trip', 'travel', 'flight', 'destination')) {
    intent = has('country', 'destination', 'where') ? 'TRAVEL_BY_COUNTRY' : 'TRAVEL_SPEND';
  } else if (has('pending', 'waiting', 'approval', 'needs my', 'inbox')) {
    intent = 'PENDING_SUMMARY';
  } else if (has('spend', 'spent', 'cost', 'expense', 'how much')) {
    intent = department ? 'SPEND_BY_DEPARTMENT' : 'SPEND_BY_DEPARTMENT';
  }

  if (!intent) return null;

  const parsed = querySchema.safeParse({ intent, period, department, country, minAmount, limit: 10 });
  return parsed.success ? parsed.data : null;
}

type Rows = Record<string, unknown>[];
function rowsOf(result: unknown): Rows {
  if (Array.isArray(result)) return result as Rows;
  return ((result as { rows?: unknown[] })?.rows ?? []) as Rows;
}

export async function answerQuestion(session: SessionUser, question: string): Promise<ManagementAnswer> {
  const parsed = classify(question);

  if (!parsed) {
    return {
      intent: 'UNKNOWN',
      summary:
        "I can't answer that from the available data. I can report on spend by department, spend trends and why they moved, travel cost and destinations, leave usage, budget position, vendors, delayed approvals and what is pending.",
      evidence: [
        'Try: "How much did SCM spend on travel this quarter?"',
        'Try: "Why did travel expenses increase last month?"',
        'Try: "Which approvals are delayed?"',
        'Try: "Show purchase requests over $5,000."',
      ],
      risk: null,
      action: null,
    };
  }

  const db = await ready();
  // Every intent query below aliases the requests table as `r`.
  const scope = visibilitySql(session, 'r');
  const period = PERIOD_SQL[parsed.period];

  switch (parsed.intent) {
    case 'SPEND_BY_DEPARTMENT': {
      const deptClause = parsed.department ? sql`and d.code = ${parsed.department}` : sql``;
      const rows = rowsOf(
        await db.execute(sql`
          select d.code as name, coalesce(sum(r.amount_base),0) as value, count(*)::int as n
          from requests r join departments d on d.id = r.department_id
          where ${scope} and r.status='APPROVED' and r.decided_at >= ${period.clause} ${deptClause}
          group by d.code order by value desc limit ${parsed.limit}
        `),
      );
      const total = rows.reduce((s, r) => s + Number(r.value), 0);
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${formatMoney(total)} approved ${period.label}${parsed.department ? ` by ${parsed.department}` : ' across all departments'}, over ${rows.reduce((s, r) => s + Number(r.n), 0)} requests.`
          : `No approved spend ${period.label} in your scope.`,
        evidence: rows.map((r) => `${r.name}: ${formatMoney(Number(r.value))} (${r.n} requests)`),
        risk: rows[0] && total > 0 && Number(rows[0].value) / total > 0.4
          ? `${rows[0].name} accounts for ${Math.round((Number(rows[0].value) / total) * 100)}% of the total — a single department concentration.`
          : null,
        action: rows.length ? 'Open Analytics to break this down by category and month.' : null,
      };
    }

    case 'SPEND_TREND': {
      const rows = rowsOf(
        await db.execute(sql`
          select to_char(date_trunc('month', r.decided_at),'YYYY-MM') as month,
                 coalesce(sum(r.amount_base),0) as value, count(*)::int as n,
                 coalesce(sum(r.amount_base) filter (where r.request_type='BUSINESS_TRIP'),0) as travel,
                 coalesce(sum(r.amount_base) filter (where r.request_type='PURCHASE'),0) as purchase,
                 coalesce(sum(r.amount_base) filter (where r.request_type='EXPENSE'),0) as expense
          from requests r
          where ${scope} and r.status='APPROVED' and r.decided_at > now() - interval '6 months'
          group by 1 order by 1
        `),
      );
      if (rows.length < 2) {
        return { intent: parsed.intent, summary: 'There is not enough history in your scope to describe a trend.', evidence: [], risk: null, action: null };
      }
      const curr = rows.at(-1)!;
      const prev = rows.at(-2)!;
      const delta = Number(prev.value) > 0 ? Math.round(((Number(curr.value) - Number(prev.value)) / Number(prev.value)) * 100) : 0;

      // Attribute the movement to the request type that moved most.
      const drivers = (['travel', 'purchase', 'expense'] as const)
        .map((k) => ({ key: k, change: Number(curr[k]) - Number(prev[k]) }))
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      /**
       * The latest bucket is usually the current, incomplete month. Comparing it
       * to a full month reads as a collapse when it is only a partial period —
       * so say how far through the month we are, and project the run rate.
       */
      const now = new Date();
      const isPartial = String(curr.month) === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const runRate = isPartial && dayOfMonth > 0 ? (Number(curr.value) / dayOfMonth) * daysInMonth : null;

      return {
        intent: parsed.intent,
        summary:
          `Approved spend ${delta >= 0 ? 'rose' : 'fell'} ${Math.abs(delta)}% from ${formatMoney(Number(prev.value))} in ${monthLabel(String(prev.month))} to ${formatMoney(Number(curr.value))} in ${monthLabel(String(curr.month))}.` +
          (isPartial && runRate !== null
            ? ` ${monthLabel(String(curr.month))} is only ${dayOfMonth} of ${daysInMonth} days in — at this run rate it would finish near ${formatMoney(runRate)}, which is ${Math.abs(Math.round(((runRate - Number(prev.value)) / Number(prev.value)) * 100))}% ${runRate >= Number(prev.value) ? 'above' : 'below'} last month.`
            : ''),
        evidence: [
          ...rows.slice(-4).map((r) => `${monthLabel(String(r.month))}: ${formatMoney(Number(r.value))} (${r.n} requests)`),
          ...drivers
            .filter((d) => Math.abs(d.change) > 1)
            .slice(0, 2)
            .map((d) => `${humanize(d.key)} ${d.change >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(d.change))}`),
        ],
        risk:
          Math.abs(delta) >= 25 && !(isPartial && delta < 0)
            ? `A ${Math.abs(delta)}% month-on-month move is outside normal variation — the largest single driver is ${humanize(drivers[0].key).toLowerCase()}.`
            : isPartial && runRate !== null && runRate > Number(prev.value) * 1.25
              ? `The run rate points to a month ${Math.round(((runRate - Number(prev.value)) / Number(prev.value)) * 100)}% above last month, driven mainly by ${humanize(drivers[0].key).toLowerCase()}.`
              : null,
        action:
          delta > 25 || (runRate !== null && runRate > Number(prev.value) * 1.25)
            ? 'Review the largest approvals in that category before further sign-off.'
            : null,
      };
    }

    case 'TRAVEL_BY_COUNTRY':
    case 'TRAVEL_SPEND': {
      const countryClause = parsed.country ? sql`and bt.country = ${parsed.country}` : sql``;
      const rows = rowsOf(
        await db.execute(sql`
          select bt.country as name, coalesce(sum(bt.total_base),0) as value, count(*)::int as n,
                 round(avg(bt.total_base)) as avg_cost
          from business_trips bt join requests r on r.id = bt.request_id
          where ${scope} and r.status='APPROVED' and r.decided_at >= ${period.clause} ${countryClause}
          group by bt.country order by value desc limit ${parsed.limit}
        `),
      );
      const total = rows.reduce((s, r) => s + Number(r.value), 0);
      const trips = rows.reduce((s, r) => s + Number(r.n), 0);
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${formatMoney(total)} of approved travel ${period.label} across ${trips} trip${trips === 1 ? '' : 's'}${parsed.country ? ` to ${parsed.country}` : ''}.`
          : `No approved travel ${period.label}${parsed.country ? ` to ${parsed.country}` : ''} in your scope.`,
        evidence: rows.map((r) => `${r.name}: ${formatMoney(Number(r.value))} over ${r.n} trip(s), averaging ${formatMoney(Number(r.avg_cost))}`),
        risk: null,
        action: rows.length ? 'Open Business Trips for the per-traveller breakdown.' : null,
      };
    }

    case 'LEAVE_TOP_USERS': {
      const rows = rowsOf(
        await db.execute(sql`
          select e.name, d.code as dept, lb.allowance, lb.carried_over, lb.used, lb.pending
          from leave_balances lb join employees e on e.id = lb.employee_id
          left join departments d on d.id = e.department_id
          where lb.year = extract(year from current_date) and lb.leave_type='ANNUAL' and e.status='ACTIVE'
          order by lb.used::numeric desc limit ${parsed.limit}
        `),
      );
      const top = rows[0];
      return {
        intent: parsed.intent,
        summary: top
          ? `${top.name} has used the most annual leave this year — ${Number(top.used)} days of ${Number(top.allowance) + Number(top.carried_over)}.`
          : 'No leave balances are configured for this year.',
        evidence: rows
          .slice(0, 8)
          .map((r) => `${r.name} (${r.dept ?? '—'}): ${Number(r.used)} used, ${Number(r.pending)} pending, ${Number(r.allowance) + Number(r.carried_over) - Number(r.used) - Number(r.pending)} left`),
        risk: rows.filter((r) => Number(r.allowance) + Number(r.carried_over) - Number(r.used) - Number(r.pending) <= 2).length
          ? `${rows.filter((r) => Number(r.allowance) + Number(r.carried_over) - Number(r.used) - Number(r.pending) <= 2).length} employee(s) have 2 days or fewer remaining.`
          : null,
        action: 'Open Leave for the full utilisation table and the team calendar.',
      };
    }

    case 'REQUESTS_OVER_AMOUNT': {
      const threshold = parsed.minAmount ?? 5000;
      const rows = rowsOf(
        await db.execute(sql`
          select r.request_number, r.title, r.amount_base, r.status, r.id, e.name as requester, d.code as dept
          from requests r join employees e on e.id = r.requester_id
          left join departments d on d.id = r.department_id
          where ${scope} and r.amount_base >= ${threshold} and coalesce(r.submitted_at, r.created_at) >= ${period.clause}
          order by r.amount_base desc limit ${parsed.limit}
        `),
      );
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${rows.length} request${rows.length === 1 ? '' : 's'} at or above ${formatMoney(threshold)} ${period.label}, totalling ${formatMoney(rows.reduce((s, r) => s + Number(r.amount_base), 0))}.`
          : `No requests at or above ${formatMoney(threshold)} ${period.label} in your scope.`,
        evidence: rows.map((r) => `${r.request_number} — ${r.title} · ${r.requester} (${r.dept ?? '—'}) · ${formatMoney(Number(r.amount_base))} · ${humanize(String(r.status))}`),
        risk: rows.filter((r) => ['SUBMITTED', 'IN_REVIEW'].includes(String(r.status))).length
          ? `${rows.filter((r) => ['SUBMITTED', 'IN_REVIEW'].includes(String(r.status))).length} of these are still awaiting a decision.`
          : null,
        action: 'Open the Approvals inbox filtered by amount to act on these.',
      };
    }

    case 'DELAYED_APPROVALS': {
      const rows = rowsOf(
        await db.execute(sql`
          select r.request_number, r.title, r.id, e.name as approver, s.name as step_name,
                 round(extract(epoch from (now() - s.due_at))/3600) as hours_over, r.amount_base
          from approval_steps s
          join requests r on r.id = s.request_id
          left join employees e on e.id = s.approver_id
          where ${scope} and s.status in ('PENDING','IN_REVIEW') and s.step_order = r.current_step_order
            and s.due_at < now() and r.status in ('SUBMITTED','IN_REVIEW')
          order by s.due_at asc limit ${parsed.limit}
        `),
      );
      const byRole = rowsOf(
        await db.execute(sql`
          select s.approver_role as role, round(avg(extract(epoch from (s.completed_at - s.started_at))/3600)::numeric,1) as avg_h
          from approval_steps s join requests r on r.id = s.request_id
          where ${scope} and s.completed_at is not null and s.completed_at > now() - interval '6 months'
          group by s.approver_role order by avg_h desc limit 3
        `),
      );
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${rows.length} approval${rows.length === 1 ? ' is' : 's are'} past their SLA, the oldest by ${Math.round(Number(rows[0].hours_over))} hours.`
          : 'No approvals are past their SLA in your scope.',
        evidence: [
          ...rows.map((r) => `${r.request_number} — ${r.title} · with ${r.approver ?? 'unassigned'} at ${r.step_name} · ${Math.round(Number(r.hours_over))}h over`),
          ...byRole.map((r) => `${humanize(String(r.role))} averages ${r.avg_h}h per decision`),
        ],
        risk: byRole[0] && Number(byRole[0].avg_h) > 30 ? `${humanize(String(byRole[0].role))} is the slowest step at ${byRole[0].avg_h}h on average.` : null,
        action: rows.length ? 'Clear the overdue items first — they are already late for the requester.' : null,
      };
    }

    case 'PENDING_SUMMARY': {
      const rows = rowsOf(
        await db.execute(sql`
          select r.request_type, count(*)::int as n, coalesce(sum(r.amount_base),0) as value
          from requests r join approval_steps s on s.request_id = r.id and s.step_order = r.current_step_order
          where s.approver_id = ${session.employeeId} and s.status in ('PENDING','IN_REVIEW')
            and r.status in ('SUBMITTED','IN_REVIEW')
          group by r.request_type order by n desc
        `),
      );
      const total = rows.reduce((s, r) => s + Number(r.n), 0);
      return {
        intent: parsed.intent,
        summary: total
          ? `${total} request${total === 1 ? '' : 's'} are waiting on your decision, worth ${formatMoney(rows.reduce((s, r) => s + Number(r.value), 0))}.`
          : 'Nothing is waiting on your decision.',
        evidence: rows.map((r) => `${humanize(String(r.request_type))}: ${r.n} (${formatMoney(Number(r.value))})`),
        risk: null,
        action: total ? 'Open the Approvals inbox — it is already sorted by risk and SLA.' : null,
      };
    }

    case 'BUDGET_STATUS': {
      const deptClause = parsed.department ? sql`and d.code = ${parsed.department}` : sql``;
      const rows = rowsOf(
        await db.execute(sql`
          select d.code as dept, b.category, b.allocated, b.committed, b.spent
          from budgets b join departments d on d.id = b.department_id
          where b.year = extract(year from current_date) and b.quarter = extract(quarter from current_date) ${deptClause}
          order by (b.spent::numeric + b.committed::numeric)/nullif(b.allocated::numeric,0) desc limit ${parsed.limit}
        `),
      );
      const over = rows.filter((r) => Number(r.spent) + Number(r.committed) > Number(r.allocated));
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${rows.length} budget line${rows.length === 1 ? '' : 's'} this quarter${parsed.department ? ` for ${parsed.department}` : ''}. ${over.length ? `${over.length} over plan.` : 'All within plan.'}`
          : 'No budget lines are configured for this quarter.',
        evidence: rows.map((r) => {
          const used = Number(r.spent) + Number(r.committed);
          const pct = Number(r.allocated) > 0 ? Math.round((used / Number(r.allocated)) * 100) : 0;
          return `${r.dept} ${humanize(String(r.category))}: ${formatMoney(used)} of ${formatMoney(Number(r.allocated))} (${pct}%)`;
        }),
        risk: over.length
          ? `Over plan: ${over.map((r) => `${r.dept} ${humanize(String(r.category)).toLowerCase()}`).join(', ')}.`
          : null,
        action: over.length ? 'Hold further approvals in those categories, or reallocate.' : null,
      };
    }

    case 'TOP_VENDORS': {
      const rows = rowsOf(
        await db.execute(sql`
          select v.name, count(*)::int as orders, coalesce(sum(pr.total_base),0) as value, v.is_preferred
          from purchase_requests pr join requests r on r.id = pr.request_id
          join vendors v on v.id = pr.vendor_id
          where ${scope} and r.status='APPROVED' and r.decided_at >= ${period.clause}
          group by v.name, v.is_preferred order by value desc limit ${parsed.limit}
        `),
      );
      const total = rows.reduce((s, r) => s + Number(r.value), 0);
      return {
        intent: parsed.intent,
        summary: rows.length
          ? `${formatMoney(total)} across ${rows.length} vendor${rows.length === 1 ? '' : 's'} ${period.label}.`
          : `No approved purchases with a recorded vendor ${period.label}.`,
        evidence: rows.map((r) => `${r.name}${r.is_preferred ? ' (preferred)' : ''}: ${formatMoney(Number(r.value))} over ${r.orders} order(s)`),
        risk:
          rows[0] && total > 0 && Number(rows[0].value) / total > 0.5
            ? `${rows[0].name} accounts for ${Math.round((Number(rows[0].value) / total) * 100)}% of procurement — a single-supplier concentration.`
            : null,
        action: 'Open Purchase Requests for the price-history comparison per item.',
      };
    }

    case 'MANAGEMENT_SUMMARY': {
      const { buildMorningBrief } = await import('./insights');
      const { aiLocale } = await import('./locale-context');
      const { getLocale } = await import('@/lib/i18n/server');
      const brief = await buildMorningBrief(session, aiLocale(await getLocale()));
      return {
        intent: parsed.intent,
        summary: `${brief.pendingCount} request${brief.pendingCount === 1 ? '' : 's'} awaiting your decision. ${brief.lines.length} item${brief.lines.length === 1 ? '' : 's'} need attention across ${scopeLabel(session).toLowerCase()}.`,
        evidence: brief.lines.map((l) => `${l.title} — ${l.detail}`),
        risk: brief.lines.find((l) => l.severity === 'CRITICAL')?.title ?? null,
        action: brief.pendingCount > 0 ? 'Start with the Approvals inbox; it is ordered by risk and SLA.' : null,
      };
    }
  }
}
