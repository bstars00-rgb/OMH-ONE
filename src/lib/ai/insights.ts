import 'server-only';
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
import type { AiLocaleContext, MorningBrief, ProactiveInsight } from './types';

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
export async function buildMorningBrief(session: SessionUser, l: AiLocaleContext): Promise<MorningBrief> {
  const { t, money } = l;
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
      title: t('brief.overdue.title', { count: stats.overdueForMe }),
      detail: t('brief.overdue.detail', { total: stats.pendingForMe }),
      href: '/approvals?sort=sla',
    });
  } else if (stats.pendingForMe > 0) {
    lines.push({
      id: 'pending',
      severity: 'INFO',
      title: t('brief.pending.title', { count: stats.pendingForMe }),
      detail: t('brief.pending.detail'),
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
        title: t('brief.spend.title', {
          pct: Math.abs(delta),
          direction: delta > 0 ? t('brief.spend.above') : t('brief.spend.below'),
        }),
        detail:
          t('brief.spend.detail', { current: money(stats.spendThisMonth), previous: money(stats.spendLastMonth) }) +
          (top ? t('brief.spend.topContributor', { name: top.name, amount: money(top.value) }) : ''),
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
        title: t('brief.travel.title', { count: tripsThisMonth }),
        detail: trips
          .slice(0, 3)
          .map((trip) => `${trip.leadName} → ${trip.city} (${l.date(trip.startDate)})`)
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
      title: t('brief.budget.title', {
        dept: b.departmentCode,
        pct,
        category: t(`budgetCategory.${b.category}`),
      }),
      detail:
        pct >= 100
          ? t('brief.budget.over', { amount: money(Math.abs(b.remaining)) })
          : t('brief.budget.left', { remaining: money(b.remaining), allocated: money(b.allocated) }),
      href: '/budgets',
    });
  }

  /* --- Leave concentration --- */
  const byDept = new Map<string, string[]>();
  // Named `row`, not `l` — `l` is the locale context in this scope.
  for (const row of leave) {
    const key = row.departmentCode ?? 'Unassigned';
    byDept.set(key, [...(byDept.get(key) ?? []), row.employeeName]);
  }
  for (const [dept, names] of byDept) {
    const unique = [...new Set(names)];
    if (unique.length >= 3) {
      lines.push({
        id: `leave-${dept}`,
        severity: 'WARNING',
        title: t('brief.leave.title', { count: unique.length, dept }),
        detail: t('brief.leave.detail', {
          names:
            unique.slice(0, 4).join(', ') +
            (unique.length > 4 ? t('brief.leave.andMore', { count: unique.length - 4 }) : ''),
        }),
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
      title: t('brief.bottleneck.title', { role: t(`approverRole.${slowest.role}`), hours: slowest.avgHours }),
      detail:
        t('brief.bottleneck.detail', { count: slowest.completed }) +
        (slowest.overdue > 0 ? t('brief.bottleneck.overdue', { count: slowest.overdue }) : ''),
      href: '/analytics',
    });
  }

  /* --- Duplicate expense suspicion --- */
  const dupes = await findDuplicateClaims(session);
  if (dupes > 0) {
    lines.push({
      id: 'duplicates',
      severity: 'CRITICAL',
      title: t('brief.duplicates.title', { count: dupes }),
      detail: t('brief.duplicates.detail'),
      href: '/expenses?risk=HIGH',
    });
  }

  /* --- Your own returned work --- */
  if (stats.myReturnedRequests > 0) {
    lines.push({
      id: 'returned',
      severity: 'WARNING',
      title: t('brief.returned.title', { count: stats.myReturnedRequests }),
      detail: t('brief.returned.detail'),
      href: '/requests?status=RETURNED',
    });
  }

  if (lines.length === 0) {
    lines.push({
      id: 'clear',
      severity: 'INFO',
      title: t('brief.clear.title'),
      detail: t('brief.clear.detail'),
    });
  }

  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  lines.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    greeting: greeting(t, session.name.split(' ')[0]),
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

function greeting(t: AiLocaleContext['t'], firstName: string) {
  const hour = new Date().getHours();
  const key = hour < 12 ? 'brief.greetingMorning' : hour < 18 ? 'brief.greetingAfternoon' : 'brief.greetingEvening';
  return t(key, { name: firstName });
}

export type { DashboardStats };
