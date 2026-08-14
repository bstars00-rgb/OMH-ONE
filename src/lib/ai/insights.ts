import 'server-only';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import { humanize, plural } from '@/lib/utils';
import { can } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import {
  getApprovalTrend,
  getBottlenecks,
  getBudgetPositions,
  getDashboardStats,
  getSpendByDepartment,
  getTeamLeave,
  getUpcomingTrips,
  type DashboardStats,
} from '@/server/queries/dashboard';
import { ready } from '@/lib/db/bootstrap';
import { sql } from 'drizzle-orm';
import { visibilitySql } from '@/lib/rbac';
import type { MorningBrief, ProactiveInsight } from './types';

/**
 * Proactive insight engine.
 *
 * Deliberately reports *exceptions*, never totals. A director does not need to be
 * told the company submitted 41 requests — they need to be told which three are
 * abnormal. Every line names a number and links to the place to act on it.
 *
 * Each finding is computed from the same aggregates the dashboard renders, so the
 * brief can never contradict the charts beneath it.
 */
export async function buildMorningBrief(session: SessionUser): Promise<MorningBrief> {
  const [stats, trend, budgets, bottlenecks, leave, trips, deptSpend] = await Promise.all([
    getDashboardStats(session),
    getApprovalTrend(session, 6),
    getBudgetPositions(session),
    getBottlenecks(session),
    getTeamLeave(session, 10),
    getUpcomingTrips(session, 8),
    getSpendByDepartment(session, 1),
  ]);

  const lines: ProactiveInsight[] = [];

  /* --- Approvals waiting on this person --- */
  if (stats.overdueForMe > 0) {
    lines.push({
      id: 'overdue',
      severity: 'CRITICAL',
      title: `${stats.overdueForMe} approval${stats.overdueForMe === 1 ? ' has' : 's have'} passed their SLA`,
      detail: `Out of ${stats.pendingForMe} waiting on you. These are already late for the requester.`,
      href: '/approvals?sort=sla',
    });
  } else if (stats.pendingForMe > 0) {
    lines.push({
      id: 'pending',
      severity: 'INFO',
      title: `${stats.pendingForMe} approval${stats.pendingForMe === 1 ? '' : 's'} waiting on you`,
      detail: 'Sorted by risk and SLA, so the most consequential are at the top.',
      href: '/approvals',
    });
  }

  /* --- Spend movement, month on month --- */
  if (stats.spendLastMonth > 0) {
    const delta = Math.round(((stats.spendThisMonth - stats.spendLastMonth) / stats.spendLastMonth) * 100);
    if (Math.abs(delta) >= 15) {
      const top = deptSpend[0];
      lines.push({
        id: 'spend-move',
        severity: delta > 40 ? 'WARNING' : 'INFO',
        title: `Approved spend is ${Math.abs(delta)}% ${delta > 0 ? 'above' : 'below'} last month`,
        detail: `${formatMoney(stats.spendThisMonth)} month to date against ${formatMoney(stats.spendLastMonth)}.${
          top ? ` Largest contributor: ${top.name} at ${formatMoney(top.value)}.` : ''
        }`,
        href: '/analytics',
      });
    }
  }

  /* --- Travel specifically, since it is the most volatile line --- */
  const travelNow = trend.at(-1);
  const travelPrev = trend.at(-2);
  if (travelNow && travelPrev && travelPrev.spend > 0) {
    const tripsThisMonth = trips.filter((t) => t.startDate.slice(0, 7) === travelNow.month).length;
    if (tripsThisMonth >= 3) {
      lines.push({
        id: 'travel-volume',
        severity: 'INFO',
        title: `${tripsThisMonth} trips starting this month`,
        detail: trips
          .slice(0, 3)
          .map((t) => `${t.leadName} → ${t.city} (${formatDate(t.startDate, 'short')})`)
          .join(' · '),
        href: '/travel',
      });
    }
  }

  /* --- Budget pressure --- */
  const strained = budgets.filter((b) => b.utilization >= 0.85).sort((a, b) => b.utilization - a.utilization);
  for (const b of strained.slice(0, 2)) {
    const pct = Math.round(b.utilization * 100);
    lines.push({
      id: `budget-${b.departmentCode}-${b.category}`,
      severity: pct >= 100 ? 'CRITICAL' : 'WARNING',
      title: `${b.departmentCode} has used ${pct}% of its quarterly ${b.category.toLowerCase()} budget`,
      detail:
        pct >= 100
          ? `Over by ${formatMoney(Math.abs(b.remaining))}. Further approvals in this category will breach the plan.`
          : `${formatMoney(b.remaining)} left of ${formatMoney(b.allocated)}.`,
      href: '/budgets',
    });
  }

  /* --- Leave concentration --- */
  const byDept = new Map<string, string[]>();
  for (const l of leave) {
    const key = l.departmentCode ?? 'Unassigned';
    byDept.set(key, [...(byDept.get(key) ?? []), l.employeeName]);
  }
  for (const [dept, names] of byDept) {
    const unique = [...new Set(names)];
    if (unique.length >= 3) {
      lines.push({
        id: `leave-${dept}`,
        severity: 'WARNING',
        title: `${unique.length} people in ${dept} are away in the next 10 days`,
        detail: `${unique.slice(0, 4).join(', ')}${unique.length > 4 ? ` and ${unique.length - 4} more` : ''}. Check coverage before approving further leave.`,
        href: '/calendar',
      });
      break;
    }
  }

  /* --- Approval turnaround --- */
  const slowest = bottlenecks[0];
  if (slowest && slowest.avgHours > 30) {
    lines.push({
      id: 'bottleneck',
      severity: slowest.avgHours > 48 ? 'WARNING' : 'INFO',
      title: `${roleLabel(slowest.role)} approvals take ${slowest.avgHours}h on average`,
      detail: `Across ${slowest.completed} decisions in the last six months${
        slowest.overdue > 0 ? `, with ${slowest.overdue} currently past SLA` : ''
      }.`,
      href: '/analytics',
    });
  }

  /* --- Duplicate expense suspicion --- */
  const dupes = await findDuplicateClaims(session);
  if (dupes > 0) {
    lines.push({
      id: 'duplicates',
      severity: 'CRITICAL',
      title: `${plural(dupes, 'expense line')} ${dupes === 1 ? 'matches' : 'match'} a receipt already claimed elsewhere`,
      detail: 'Same merchant, date and amount on a different claim. Open the claim to see both.',
      href: '/expenses?risk=HIGH',
    });
  }

  /* --- Your own returned work --- */
  if (stats.myReturnedRequests > 0) {
    lines.push({
      id: 'returned',
      severity: 'WARNING',
      title: `${stats.myReturnedRequests} of your requests ${stats.myReturnedRequests === 1 ? 'was' : 'were'} returned`,
      detail: 'An approver asked for changes. Edit and resubmit to continue.',
      href: '/requests?status=RETURNED',
    });
  }

  if (lines.length === 0) {
    lines.push({
      id: 'clear',
      severity: 'INFO',
      title: 'Nothing needs your attention',
      detail: 'No overdue approvals, budget breaches or unusual activity in your scope.',
    });
  }

  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  lines.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    greeting: greeting(session.name.split(' ')[0]),
    pendingCount: stats.pendingForMe,
    lines: lines.slice(0, 5),
    degraded: false,
  };
}

async function findDuplicateClaims(session: SessionUser): Promise<number> {
  const db = await ready();
  const scope = visibilitySql(session, 'r');
  try {
    const result = await db.execute(sql`
      select count(*)::int as n from (
        select ei.receipt_hash
        from expense_items ei
        join expense_claims ec on ec.id = ei.claim_id
        join requests r on r.id = ec.request_id
        where ${scope} and r.status <> 'CANCELED' and ei.receipt_hash is not null
        group by ei.receipt_hash
        having count(distinct ec.id) > 1
      ) x
    `);
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    return Number((rows[0] as { n?: number })?.n ?? 0);
  } catch {
    return 0;
  }
}

const roleLabel = humanize;

function greeting(firstName: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${firstName}`;
}

export type { DashboardStats };
export { can };
