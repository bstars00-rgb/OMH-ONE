'use client';

/**
 * Status, priority, risk and type badges.
 *
 * Client components so they can translate themselves — every call site stays
 * unchanged whether it sits in a server or client tree. They are leaf-level and
 * tiny, so the client-bundle cost is negligible next to keeping one badge
 * definition for the whole app.
 */
import * as React from 'react';
import * as Icons from 'lucide-react';
import { Badge } from './primitives';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import {
  PRIORITY_META,
  REQUEST_TYPE_META,
  RISK_META,
  STATUS_META,
  type Priority,
  type RequestStatus,
  type RequestType,
  type RiskLevel,
} from '@/types/domain';

/** Resolve a Lucide icon by name; the meta maps store names, not components. */
function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Cmp) return null;
  return <Cmp className={cn('size-3', className)} />;
}

/**
 * Status is communicated by icon + label + tooltip, never by colour alone —
 * the badge is readable in greyscale and to a screen reader.
 */
export function StatusBadge({ status, className }: { status: RequestStatus | string; className?: string }) {
  const t = useT();
  const key = (STATUS_META[status as RequestStatus] ? status : 'DRAFT') as RequestStatus;
  const meta = STATUS_META[key];
  return (
    <Badge tone={meta.tone} className={className} title={t(`status.${key}.tip`)}>
      <Icon name={meta.icon} />
      {t(`status.${key}`)}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority | string; className?: string }) {
  const t = useT();
  const key = (PRIORITY_META[priority as Priority] ? priority : 'NORMAL') as Priority;
  const meta = PRIORITY_META[key];
  return (
    <Badge tone={meta.tone} className={className} title={t(`priority.${key}.tip`)}>
      <Icon name={meta.icon} />
      {t(`priority.${key}`)}
    </Badge>
  );
}

export function RiskBadge({ risk, className }: { risk: RiskLevel | string; className?: string }) {
  const t = useT();
  const key = (RISK_META[risk as RiskLevel] ? risk : 'LOW') as RiskLevel;
  const meta = RISK_META[key];
  return (
    <Badge tone={meta.tone} className={className} title={t(`risk.${key}.tip`)}>
      <Icon name={meta.icon} />
      {t(`risk.${key}`)}
    </Badge>
  );
}

export function TypeBadge({ type, className }: { type: RequestType | string; className?: string }) {
  const t = useT();
  const key = (REQUEST_TYPE_META[type as RequestType] ? type : 'GENERAL') as RequestType;
  const meta = REQUEST_TYPE_META[key];
  return (
    <Badge tone="slate" className={className} title={t(`type.${key}`)}>
      <Icon name={meta.icon} />
      {t(`type.${key}.short`)}
    </Badge>
  );
}

export function TypeIcon({ type, className }: { type: RequestType | string; className?: string }) {
  const meta = REQUEST_TYPE_META[type as RequestType] ?? REQUEST_TYPE_META.GENERAL;
  return <Icon name={meta.icon} className={className} />;
}

/**
 * SLA indicator. Shows remaining time, or how far overdue — an approver needs
 * the direction, not just a colour.
 *
 * `hoursRemaining` is computed by the database rather than from `Date.now()` at
 * render time. One clock, so a row cannot say "2h left" in the table and "1h
 * left" in the panel next to it, and the value is identical on server and client.
 */
export function SlaBadge({
  hoursRemaining,
  completed,
  className,
}: {
  hoursRemaining: number | null | undefined;
  completed?: boolean;
  className?: string;
}) {
  const t = useT();

  if (completed) return <span className={cn('text-xs text-text-subtle', className)}>{t('label.closed')}</span>;
  if (hoursRemaining === null || hoursRemaining === undefined) {
    return <span className={cn('text-xs text-text-subtle', className)}>—</span>;
  }

  const hours = hoursRemaining;

  if (hours < 0) {
    const span = formatSpan(t, Math.abs(hours));
    return (
      <Badge tone="rose" className={className} title={t('sla.passedAgo', { span })}>
        <Icons.AlarmClockOff className="size-3" />
        {t('sla.over', { span })}
      </Badge>
    );
  }
  if (hours < 6) {
    const span = formatSpan(t, hours);
    return (
      <Badge tone="amber" className={className} title={t('sla.expiresIn', { span })}>
        <Icons.AlarmClock className="size-3" />
        {t('sla.left', { span })}
      </Badge>
    );
  }
  const span = formatSpan(t, hours);
  return (
    <span className={cn('text-xs text-text-muted tabular', className)} title={t('sla.expiresIn', { span })}>
      {t('sla.left', { span })}
    </span>
  );
}

function formatSpan(t: (key: string, vars?: Record<string, string | number>) => string, hours: number): string {
  if (hours < 1) return t('sla.minutes', { n: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return t('sla.hours', { n: Math.round(hours) });
  return t('sla.days', { n: Math.round(hours / 24) });
}
