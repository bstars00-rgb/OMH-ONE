import * as React from 'react';
import Link from 'next/link';
import { monthLabel } from '@/lib/dates';
import { CategoryBars, ChartCard, SpendLine } from '@/components/charts';
import { Card, CardHeader } from '@/components/ui/primitives';
import { humanize } from '@/lib/utils';
import { formatMoney } from '@/lib/money';

/**
 * Shared pieces for the module dashboards (travel, procurement, expense, leave).
 * Each module supplies its own numbers; the presentation stays identical so a
 * user who learns one page has learned all four.
 */

export function MonthlySpendChart({
  title,
  subtitle,
  monthly,
  current,
  previous,
}: {
  title: string;
  subtitle: string;
  monthly: { month: string; value: number }[];
  current: number;
  previous: number;
}) {
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      metric={formatMoney(current)}
      delta={delta === null ? null : { value: delta, label: 'vs last month' }}
      isEmpty={monthly.length === 0}
    >
      <SpendLine data={monthly.map((m) => ({ label: monthLabel(m.month), spend: m.value }))} />
    </ChartCard>
  );
}

export function BreakdownChart({
  title,
  subtitle,
  data,
  money = true,
  humanizeNames = true,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number; count?: number }[];
  money?: boolean;
  humanizeNames?: boolean;
}) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      metric={money ? formatMoney(data.reduce((s, d) => s + d.value, 0)) : String(data.reduce((s, d) => s + d.value, 0))}
      isEmpty={data.length === 0}
    >
      <CategoryBars data={data.map((d) => ({ ...d, name: humanizeNames ? humanize(d.name) : d.name }))} money={money} />
    </ChartCard>
  );
}

export function RankedList({
  title,
  description,
  items,
  emptyMessage,
  action,
}: {
  title: string;
  description?: string;
  items: { key: string; primary: string; secondary?: string; value: string; href?: string; badge?: React.ReactNode }[];
  emptyMessage: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} actions={action} />
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-text-subtle">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {items.map((item, i) => {
            const body = (
              <>
                <span className="w-5 shrink-0 text-[11px] text-text-subtle tabular">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">{item.primary}</span>
                  {item.secondary && <span className="block truncate text-[11px] text-text-muted">{item.secondary}</span>}
                </span>
                {item.badge}
                <span className="shrink-0 text-[13px] font-medium text-text tabular">{item.value}</span>
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link href={item.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
