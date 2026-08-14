'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n, useT } from '@/lib/i18n/client';
import { formatCompactL, formatMoneyL } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

/**
 * Categorical ramp chosen to stay distinguishable in both themes and to survive
 * greyscale printing — order is by luminance, not hue, so adjacent series differ
 * in lightness as well as colour.
 */
export const SERIES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#64748b'];

const STATUS_COLOR: Record<string, string> = {
  APPROVED: '#10b981',
  SUBMITTED: '#0ea5e9',
  IN_REVIEW: '#f59e0b',
  REJECTED: '#f43f5e',
  RETURNED: '#f97316',
  DRAFT: '#94a3b8',
  CANCELED: '#64748b',
};

const axisProps = {
  stroke: 'var(--text-subtle)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  money?: boolean;
}) {
  const { locale } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-xs shadow-popover">
      {label && <p className="mb-1 font-medium text-text">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} aria-hidden="true" />
          <span>{p.name}:</span>
          <span className="font-medium text-text tabular">
            {money ? formatMoneyL(locale, p.value) : p.value.toLocaleString(locale)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Every chart is wrapped so it always carries a title, a headline figure and an empty state. */
export function ChartCard({
  title,
  subtitle,
  metric,
  delta,
  children,
  isEmpty,
  emptyMessage,
  action,
  className,
  height = 220,
}: {
  title: string;
  subtitle?: string;
  metric?: string;
  delta?: { value: number; label: string } | null;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  action?: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const t = useT();
  return (
    <section className={cn('rounded-[var(--radius-card)] border border-border-subtle bg-surface', className)}>
      <header className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-text">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>}
          {metric && (
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-text tabular">{metric}</span>
              {delta && (
                <span
                  className={cn(
                    'text-[11px] font-semibold',
                    delta.value > 0 ? 'text-rose-600 dark:text-rose-400' : delta.value < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-subtle',
                  )}
                >
                  {delta.value > 0 ? '+' : ''}
                  {delta.value}% {delta.label}
                </span>
              )}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="px-2 pb-3" style={{ height }}>
        {isEmpty ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-xs text-text-subtle">{emptyMessage ?? t('chart.noData')}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export function StatusDonut({ data }: { data: { status: string; count: number; label: string }[] }) {
  return (
    <PieChart>
      <Pie data={data} dataKey="count" nameKey="label" innerRadius="55%" outerRadius="82%" paddingAngle={2} strokeWidth={0}>
        {data.map((d) => (
          <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? '#94a3b8'} />
        ))}
      </Pie>
      <Tooltip content={<ChartTooltip />} />
      <Legend
        verticalAlign="middle"
        align="right"
        layout="vertical"
        iconType="circle"
        iconSize={7}
        formatter={(value, entry) => (
          <span className="text-[11px] text-text-muted">
            {value} <span className="font-medium text-text tabular">{(entry?.payload as unknown as { count: number })?.count}</span>
          </span>
        )}
      />
    </PieChart>
  );
}

export function TrendArea({
  data,
}: {
  data: { label: string; submitted: number; approved: number; rejected: number }[];
}) {
  const t = useT();
  return (
    <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="gradSubmitted" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
          <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis {...axisProps} width={40} allowDecimals={false} />
      <Tooltip content={<ChartTooltip />} />
      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
      <Area
        type="monotone"
        dataKey="submitted"
        name={t('status.SUBMITTED')}
        stroke={SERIES[0]}
        fill="url(#gradSubmitted)"
        strokeWidth={2}
      />
      <Line type="monotone" dataKey="approved" name={t('status.APPROVED')} stroke={SERIES[2]} strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="rejected" name={t('status.REJECTED')} stroke={SERIES[4]} strokeWidth={2} dot={false} />
    </AreaChart>
  );
}

export function SpendLine({ data }: { data: { label: string; spend: number }[] }) {
  const { t, locale } = useI18n();
  return (
    <LineChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis {...axisProps} width={52} tickFormatter={(v) => formatCompactL(locale, v)} />
      <Tooltip content={<ChartTooltip money />} />
      <Line
        type="monotone"
        dataKey="spend"
        name={t('chart.approvedSpend')}
        stroke={SERIES[0]}
        strokeWidth={2.5}
        dot={{ r: 3 }}
      />
    </LineChart>
  );
}

export function CategoryBars({
  data,
  money = true,
  horizontal = true,
}: {
  data: { name: string; value: number }[];
  money?: boolean;
  horizontal?: boolean;
}) {
  const { t, locale } = useI18n();
  const seriesName = t(money ? 'chart.spend' : 'chart.count');

  if (horizontal) {
    return (
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => (money ? formatCompactL(locale, v) : String(v))} />
        <YAxis type="category" dataKey="name" {...axisProps} width={68} />
        <Tooltip content={<ChartTooltip money={money} />} cursor={{ fill: 'var(--surface-hover)' }} />
        <Bar dataKey="value" name={seriesName} radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    );
  }
  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
      <XAxis dataKey="name" {...axisProps} />
      <YAxis {...axisProps} width={52} tickFormatter={(v) => (money ? formatCompactL(locale, v) : String(v))} />
      <Tooltip content={<ChartTooltip money={money} />} cursor={{ fill: 'var(--surface-hover)' }} />
      <Bar dataKey="value" name={seriesName} radius={[4, 4, 0, 0]} maxBarSize={40}>
        {data.map((_, i) => (
          <Cell key={i} fill={SERIES[i % SERIES.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}

export function BottleneckBars({ data }: { data: { role: string; avgHours: number }[] }) {
  const t = useT();
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
      <XAxis type="number" {...axisProps} tickFormatter={(v) => `${v}h`} />
      <YAxis type="category" dataKey="role" {...axisProps} width={78} />
      <Tooltip
        cursor={{ fill: 'var(--surface-hover)' }}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-xs shadow-popover">
              <p className="font-medium text-text">{label}</p>
              <p className="text-text-muted">{t('chart.avgPerDecision', { hours: String(payload[0].value) })}</p>
            </div>
          ) : null
        }
      />
      <Bar dataKey="avgHours" name={t('chart.avgHours')} radius={[0, 4, 4, 0]} maxBarSize={22}>
        {data.map((d, i) => (
          <Cell key={i} fill={d.avgHours > 30 ? '#f43f5e' : d.avgHours > 20 ? '#f59e0b' : '#10b981'} />
        ))}
      </Bar>
    </BarChart>
  );
}
