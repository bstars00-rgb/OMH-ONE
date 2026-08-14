import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { getBudgetPositions } from '@/server/queries/dashboard';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { StatTile } from '@/components/stat-tile';
import { Alert, Card, CardHeader, Progress } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { getI18n, getT } from '@/lib/i18n/server';
import { formatCompactL, formatMoneyL } from '@/lib/i18n/format';
import { quarterOf } from '@/lib/dates';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('budget.title') };
}

export default async function BudgetsPage() {
  const session = await requireSession();
  const { t, locale } = await getI18n();
  if (!can(session, 'finance.view')) return <ForbiddenPage what={t('budget.title')} />;

  const budgets = await getBudgetPositions(session);
  const now = new Date();

  const allocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);
  const committed = budgets.reduce((s, b) => s + b.committed, 0);
  const remaining = allocated - spent - committed;
  const overBudget = budgets.filter((b) => b.utilization >= 1);
  const nearLimit = budgets.filter((b) => b.utilization >= 0.85 && b.utilization < 1);

  const money = (v: number) => formatMoneyL(locale, v);
  const compact = (v: number) => formatCompactL(locale, v);

  const byDepartment = new Map<string, typeof budgets>();
  for (const b of budgets) {
    byDepartment.set(b.departmentCode, [...(byDepartment.get(b.departmentCode) ?? []), b]);
  }

  return (
    <>
      <PageHeader
        title={t('budget.title')}
        description={t('budget.subtitle', { quarter: quarterOf(now), year: now.getUTCFullYear() })}
      />

      {overBudget.length > 0 && (
        <Alert
          tone="rose"
          title={t('budget.overTitle', { count: overBudget.length })}
          icon={<AlertTriangle className="size-4" />}
          className="mb-5"
        >
          {overBudget
            .map((b) => `${b.departmentCode} ${t(`budgetCategory.${b.category}`)} (${Math.round(b.utilization * 100)}%)`)
            .join(', ')}
          {t('budget.overBody')}
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label={t('budget.allocated')} value={compact(allocated)} sublabel={t('budget.subtitleQuarter', { quarter: quarterOf(now) })} icon="Wallet" />
        <StatTile label={t('budget.spent')} value={compact(spent)} sublabel={t('budget.spentSub')} icon="CheckCircle2" />
        <StatTile label={t('budget.committed')} value={compact(committed)} sublabel={t('budget.committedSub')} icon="Clock" />
        <StatTile
          label={t('budget.remaining')}
          value={compact(remaining)}
          sublabel={
            allocated > 0 ? t('budget.usedPct', { pct: Math.round(((spent + committed) / allocated) * 100) }) : '—'
          }
          icon="PiggyBank"
          tone={remaining < 0 ? 'critical' : 'default'}
        />
        <StatTile
          label={t('budget.atRisk')}
          value={overBudget.length + nearLimit.length}
          sublabel={t('budget.atRiskSub', { over: overBudget.length, near: nearLimit.length })}
          icon="AlertTriangle"
          tone={overBudget.length > 0 ? 'critical' : nearLimit.length > 0 ? 'warning' : 'positive'}
        />
      </div>

      <div className="space-y-4">
        {[...byDepartment.entries()].map(([dept, lines]) => {
          const deptAllocated = lines.reduce((s, b) => s + b.allocated, 0);
          const deptUsed = lines.reduce((s, b) => s + b.spent + b.committed, 0);
          return (
            <Card key={dept}>
              <CardHeader
                title={dept}
                description={t('budget.deptUsage', { used: money(deptUsed), allocated: money(deptAllocated) })}
                actions={
                  <span
                    className={
                      deptUsed > deptAllocated
                        ? 'text-sm font-semibold text-rose-600 tabular dark:text-rose-400'
                        : 'text-sm font-semibold text-text tabular'
                    }
                  >
                    {deptAllocated > 0 ? Math.round((deptUsed / deptAllocated) * 100) : 0}%
                  </span>
                }
              />
              <TableWrap>
                <THead>
                  <TR>
                    <TH>{t('label.category')}</TH>
                    <TH align="right">{t('budget.allocated')}</TH>
                    <TH align="right">{t('budget.spent')}</TH>
                    <TH align="right">{t('budget.committed')}</TH>
                    <TH align="right">{t('budget.remaining')}</TH>
                    <TH className="w-40">{t('budget.utilization')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((b) => (
                    <TR key={`${b.departmentCode}-${b.category}`}>
                      <TD className="font-medium">{t(`budgetCategory.${b.category}`)}</TD>
                      <TD numeric>{money(b.allocated)}</TD>
                      <TD numeric>{money(b.spent)}</TD>
                      <TD numeric className="text-text-muted">
                        {money(b.committed)}
                      </TD>
                      <TD numeric className={b.remaining < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
                        {money(b.remaining)}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={b.spent + b.committed}
                            max={b.allocated}
                            className="flex-1"
                            label={`${b.departmentCode} ${t(`budgetCategory.${b.category}`)} — ${t('budget.utilization')}`}
                          />
                          <span className="w-9 shrink-0 text-right text-[11px] text-text-muted tabular">
                            {Math.round(b.utilization * 100)}%
                          </span>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-subtle">
        {t('budget.explain')}{' '}
        <Link href="/approvals?view=all" className="text-accent hover:underline">
          {t('budget.requestsLink')} →
        </Link>
      </p>
    </>
  );
}
