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
import { formatCompact, formatMoney } from '@/lib/money';
import { humanize } from '@/lib/utils';
import { quarterOf } from '@/lib/dates';

export const metadata: Metadata = { title: 'Budgets' };

export default async function BudgetsPage() {
  const session = await requireSession();
  if (!can(session, 'finance.view')) return <ForbiddenPage what="budgets" />;

  const budgets = await getBudgetPositions(session);
  const now = new Date();

  const allocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);
  const committed = budgets.reduce((s, b) => s + b.committed, 0);
  const remaining = allocated - spent - committed;
  const overBudget = budgets.filter((b) => b.utilization >= 1);
  const nearLimit = budgets.filter((b) => b.utilization >= 0.85 && b.utilization < 1);

  const byDepartment = new Map<string, typeof budgets>();
  for (const b of budgets) {
    byDepartment.set(b.departmentCode, [...(byDepartment.get(b.departmentCode) ?? []), b]);
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        description={`Q${quarterOf(now)} ${now.getUTCFullYear()} · allocated, committed by in-flight requests, and spent on approved ones.`}
      />

      {overBudget.length > 0 && (
        <Alert
          tone="rose"
          title={`${overBudget.length} budget line${overBudget.length === 1 ? ' is' : 's are'} over plan`}
          icon={<AlertTriangle className="size-4" />}
          className="mb-5"
        >
          {overBudget
            .map((b) => `${b.departmentCode} ${humanize(b.category).toLowerCase()} (${Math.round(b.utilization * 100)}%)`)
            .join(', ')}
          . Further approvals in these categories will deepen the overrun.
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Allocated" value={formatCompact(allocated)} sublabel="This quarter" icon="Wallet" />
        <StatTile label="Spent" value={formatCompact(spent)} sublabel="Approved requests" icon="CheckCircle2" />
        <StatTile label="Committed" value={formatCompact(committed)} sublabel="Awaiting decision" icon="Clock" />
        <StatTile
          label="Remaining"
          value={formatCompact(remaining)}
          sublabel={allocated > 0 ? `${Math.round(((spent + committed) / allocated) * 100)}% used` : '—'}
          icon="PiggyBank"
          tone={remaining < 0 ? 'critical' : 'default'}
        />
        <StatTile
          label="Lines at risk"
          value={overBudget.length + nearLimit.length}
          sublabel={`${overBudget.length} over, ${nearLimit.length} near limit`}
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
                description={`${formatMoney(deptUsed)} of ${formatMoney(deptAllocated)} used this quarter`}
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
                    <TH>Category</TH>
                    <TH align="right">Allocated</TH>
                    <TH align="right">Spent</TH>
                    <TH align="right">Committed</TH>
                    <TH align="right">Remaining</TH>
                    <TH className="w-40">Utilisation</TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((b) => (
                    <TR key={`${b.departmentCode}-${b.category}`}>
                      <TD className="font-medium">{humanize(b.category)}</TD>
                      <TD numeric>{formatMoney(b.allocated)}</TD>
                      <TD numeric>{formatMoney(b.spent)}</TD>
                      <TD numeric className="text-text-muted">
                        {formatMoney(b.committed)}
                      </TD>
                      <TD numeric className={b.remaining < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
                        {formatMoney(b.remaining)}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={b.spent + b.committed}
                            max={b.allocated}
                            className="flex-1"
                            label={`${b.departmentCode} ${b.category} utilisation`}
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
        Submitting a request moves its value into <strong>committed</strong>; approving it moves that value into{' '}
        <strong>spent</strong>; rejecting, returning or withdrawing releases it. Both movements happen in the same
        database transaction as the status change, so these figures cannot drift from the{' '}
        <Link href="/approvals?view=all" className="text-accent hover:underline">
          requests
        </Link>{' '}
        that produced them.
      </p>
    </>
  );
}
