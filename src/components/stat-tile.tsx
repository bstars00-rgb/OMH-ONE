import * as React from 'react';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dashboard metric tile. The comparison line is required by design — a number
 * without a reference point tells an approver nothing about whether to act.
 */
export function StatTile({
  label,
  value,
  sublabel,
  delta,
  icon,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  delta?: { value: number; suffix?: string } | null;
  icon?: string;
  href?: string;
  tone?: 'default' | 'critical' | 'warning' | 'positive';
}) {
  const Icon = icon ? (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[icon] : null;

  const toneRing = {
    default: 'border-border-subtle',
    critical: 'border-rose-300 dark:border-rose-900',
    warning: 'border-amber-300 dark:border-amber-900',
    positive: 'border-emerald-300 dark:border-emerald-900',
  }[tone];

  const toneIcon = {
    default: 'text-text-subtle',
    critical: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    positive: 'text-emerald-600 dark:text-emerald-400',
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-text-muted">{label}</p>
        {Icon && <Icon className={cn('size-4 shrink-0', toneIcon)} />}
      </div>
      <p className="mt-1.5 text-2xl leading-none font-semibold text-text tabular">{value}</p>
      <div className="mt-1.5 flex min-h-4 items-baseline gap-1.5">
        {delta != null && (
          <span
            className={cn(
              'text-[11px] font-semibold',
              delta.value > 0 ? 'text-rose-600 dark:text-rose-400' : delta.value < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-subtle',
            )}
          >
            {delta.value > 0 ? '↑' : delta.value < 0 ? '↓' : '–'} {Math.abs(delta.value)}
            {delta.suffix ?? '%'}
          </span>
        )}
        {sublabel && <span className="truncate text-[11px] text-text-subtle">{sublabel}</span>}
      </div>
    </>
  );

  const className = cn(
    'block rounded-[var(--radius-card)] border bg-surface p-3.5 transition-colors',
    toneRing,
    href && 'hover:border-accent-border hover:bg-accent-soft/30',
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
