import * as React from 'react';
import * as Icons from 'lucide-react';
import { Badge } from './primitives';
import { cn } from '@/lib/utils';
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
  const meta = STATUS_META[status as RequestStatus] ?? STATUS_META.DRAFT;
  return (
    <Badge tone={meta.tone} className={className} title={meta.tooltip}>
      <Icon name={meta.icon} />
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority | string; className?: string }) {
  const meta = PRIORITY_META[priority as Priority] ?? PRIORITY_META.NORMAL;
  return (
    <Badge tone={meta.tone} className={className} title={meta.tooltip}>
      <Icon name={meta.icon} />
      {meta.label}
    </Badge>
  );
}

export function RiskBadge({ risk, className }: { risk: RiskLevel | string; className?: string }) {
  const meta = RISK_META[risk as RiskLevel] ?? RISK_META.LOW;
  return (
    <Badge tone={meta.tone} className={className} title={meta.tooltip}>
      <Icon name={meta.icon} />
      {meta.label}
    </Badge>
  );
}

export function TypeBadge({ type, className }: { type: RequestType | string; className?: string }) {
  const meta = REQUEST_TYPE_META[type as RequestType] ?? REQUEST_TYPE_META.GENERAL;
  return (
    <Badge tone="slate" className={className} title={meta.label}>
      <Icon name={meta.icon} />
      {meta.short}
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
  if (completed) return <span className={cn('text-xs text-text-subtle', className)}>Closed</span>;
  if (hoursRemaining === null || hoursRemaining === undefined) {
    return <span className={cn('text-xs text-text-subtle', className)}>—</span>;
  }

  const hours = hoursRemaining;

  if (hours < 0) {
    const over = Math.abs(hours);
    return (
      <Badge tone="rose" className={className} title={`SLA passed ${formatSpan(over)} ago`}>
        <Icons.AlarmClockOff className="size-3" />
        {formatSpan(over)} over
      </Badge>
    );
  }
  if (hours < 6) {
    return (
      <Badge tone="amber" className={className} title={`SLA expires in ${formatSpan(hours)}`}>
        <Icons.AlarmClock className="size-3" />
        {formatSpan(hours)} left
      </Badge>
    );
  }
  return (
    <span className={cn('text-xs text-text-muted tabular', className)} title={`SLA expires in ${formatSpan(hours)}`}>
      {formatSpan(hours)} left
    </span>
  );
}

function formatSpan(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
