import * as React from 'react';
import Link from 'next/link';
import { CategoryBars, ChartCard, SpendLine } from '@/components/charts';
import { Card, CardHeader } from '@/components/ui/primitives';
import { getI18n } from '@/lib/i18n/server';
import { formatMoneyL, monthLabelL } from '@/lib/i18n/format';
import { humanize } from '@/lib/utils';

/**
 * Shared pieces for the module dashboards (travel, procurement, expense, leave).
 * Each module supplies its own numbers; the presentation stays identical so a
 * user who learns one page has learned all four.
 */

export async function MonthlySpendChart({
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
  const { t, locale } = await getI18n();
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      metric={formatMoneyL(locale, current)}
      delta={delta === null ? null : { value: delta, label: t('label.vsLastMonth') }}
      isEmpty={monthly.length === 0}
    >
      <SpendLine data={monthly.map((m) => ({ label: monthLabelL(locale, m.month), spend: m.value }))} />
    </ChartCard>
  );
}

export async function BreakdownChart({
  title,
  subtitle,
  data,
  money = true,
  nameKey,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number; count?: number }[];
  money?: boolean;
  /**
   * Dictionary prefix for the category axis, e.g. `purchaseCategory`. Names that
   * have no entry (a country, a person) fall back to the raw value, so callers
   * whose axis is already proper nouns simply omit this.
   */
  nameKey?: string;
}) {
  const { tOr, locale } = await getI18n();
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      metric={money ? formatMoneyL(locale, total) : String(total)}
      isEmpty={data.length === 0}
    >
      <CategoryBars
        data={data.map((d) => ({ ...d, name: nameKey ? tOr(`${nameKey}.${d.name}`, humanize(d.name)) : d.name }))}
        money={money}
      />
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
