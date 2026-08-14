'use client';

import * as React from 'react';
import { Ban, Check, Clock, Eye, PencilLine, Send, Undo2, X, CircleDashed } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { hoursBetween } from '@/lib/dates';
import { useI18n } from '@/lib/i18n/client';
import { formatDateTimeL, formatDurationL } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';
import type { RequestDetail } from '@/server/queries/requests';

const ACTION_META: Record<string, { icon: React.ReactNode; key: string; tone: string }> = {
  SUBMIT: { icon: <Send className="size-3" />, key: 'detail.act.submitted', tone: 'text-blue-600 dark:text-blue-400' },
  VIEW: { icon: <Eye className="size-3" />, key: 'detail.act.viewed', tone: 'text-text-subtle' },
  APPROVE: { icon: <Check className="size-3" />, key: 'detail.act.approved', tone: 'text-emerald-600 dark:text-emerald-400' },
  REJECT: { icon: <X className="size-3" />, key: 'detail.act.rejected', tone: 'text-rose-600 dark:text-rose-400' },
  RETURN: { icon: <Undo2 className="size-3" />, key: 'detail.act.returned', tone: 'text-orange-600 dark:text-orange-400' },
  CANCEL: { icon: <Ban className="size-3" />, key: 'detail.act.canceled', tone: 'text-text-muted' },
};

/**
 * Two views of the same history: the *chain* (where the request is going) and the
 * *log* (what actually happened, with timings). Approvers need both — the chain to
 * see who is next, the log to see who has been sitting on it.
 */
export function ApprovalChain({ detail }: { detail: RequestDetail }) {
  const { t, locale } = useI18n();
  const { steps, request } = detail;

  if (steps.length === 0) {
    return <p className="text-xs text-text-muted">{t('detail.routeNotSubmitted')}</p>;
  }

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const isCurrent = s.stepOrder === request.currentStepOrder && ['SUBMITTED', 'IN_REVIEW'].includes(request.status);
        const done = s.status === 'APPROVED';
        const failed = s.status === 'REJECTED';
        const returned = s.status === 'RETURNED';
        const skipped = s.status === 'SKIPPED';
        const elapsed = s.startedAt && s.completedAt ? hoursBetween(s.startedAt, s.completedAt) : null;
        const overdue = isCurrent && s.isOverdue;

        return (
          <li key={s.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  done && 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                  failed && 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
                  returned && 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
                  isCurrent && 'border-accent bg-accent-soft text-accent',
                  skipped && 'border-border-subtle bg-surface-sunken text-text-subtle',
                  !done && !failed && !returned && !isCurrent && !skipped && 'border-border-subtle bg-surface text-text-subtle',
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-3" /> : failed ? <X className="size-3" /> : returned ? <Undo2 className="size-3" /> : isCurrent ? <Clock className="size-3" /> : skipped ? <CircleDashed className="size-3" /> : s.stepOrder}
              </span>
              {i < steps.length - 1 && <span className="w-px flex-1 bg-border-subtle" aria-hidden="true" />}
            </div>

            <div className={cn('min-w-0 flex-1', i < steps.length - 1 && 'pb-4')}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                {/* Seeded step names have translations; custom ones fall back to their own text. */}
                <p className="text-[13px] font-medium text-text">{t(`step.${s.name}`) === `step.${s.name}` ? s.name : t(`step.${s.name}`)}</p>
                {isCurrent && (
                  <span className={cn('text-[10px] font-semibold uppercase', overdue ? 'text-rose-600 dark:text-rose-400' : 'text-accent')}>
                    {overdue ? t('detail.overdue') : t('detail.awaitingDecision')}
                  </span>
                )}
                {skipped && <span className="text-[10px] text-text-subtle uppercase">{t('detail.notReached')}</span>}
              </div>
              <p className="text-xs text-text-muted">
                {s.approverName ?? t('label.notAssigned')}
                {s.approverPosition ? ` · ${s.approverPosition}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-text-subtle tabular">
                {done &&
                  s.completedAt &&
                  t('detail.stepApprovedAt', {
                    when: formatDateTimeL(locale, s.completedAt),
                    duration: elapsed !== null ? formatDurationL(locale, elapsed) : '—',
                  })}
                {failed && s.completedAt && t('detail.stepRejectedAt', { when: formatDateTimeL(locale, s.completedAt) })}
                {returned && s.completedAt && t('detail.stepReturnedAt', { when: formatDateTimeL(locale, s.completedAt) })}
                {isCurrent && s.dueAt && t('detail.stepDue', { hours: s.slaHours, when: formatDateTimeL(locale, s.dueAt) })}
                {!done && !failed && !returned && !isCurrent && !skipped && t('detail.stepWaiting', { hours: s.slaHours })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityLog({ detail }: { detail: RequestDetail }) {
  const { t, locale } = useI18n();

  const entries = [
    {
      key: 'created',
      at: detail.request.createdAt,
      who: detail.requester.name,
      node: (
        <span className="flex items-center gap-1.5 text-text-muted">
          <PencilLine className="size-3" /> {t('detail.act.created')}
        </span>
      ),
      comment: null as string | null,
    },
    ...detail.actions.map((a) => {
      const meta = ACTION_META[a.action];
      return {
        key: a.id,
        at: a.actionAt,
        who: a.approverName ?? t('audit.system'),
        node: (
          <span className={cn('flex items-center gap-1.5', meta?.tone ?? 'text-text-muted')}>
            {meta?.icon} {meta ? t(meta.key) : a.action.toLowerCase()}
          </span>
        ),
        comment: a.comment,
      };
    }),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.key} className="flex gap-2.5">
          <Avatar name={e.who} size="xs" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
              <span className="font-medium text-text">{e.who}</span>
              {e.node}
              <span className="text-[11px] text-text-subtle tabular">{formatDateTimeL(locale, e.at)}</span>
            </p>
            {e.comment && (
              <p className="mt-1 rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2.5 py-1.5 text-xs text-text">
                {e.comment}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
