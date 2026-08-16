'use client';

import * as React from 'react';
import { Loader2, Lock, Plus, UserPlus, X } from 'lucide-react';
import { Avatar, Button, Card, CardBody, CardHeader, Select } from '@/components/ui/primitives';
import { previewChainAction, type ChainStep } from '@/server/actions/chain-preview';
import { useI18n } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface ChainFacts {
  requestType: string;
  templateId?: string | null;
  amountBase?: number;
  days?: number;
  isInternational?: boolean;
  quotationCount?: number;
}

/**
 * The approval route, shown before submitting.
 *
 * Two things this answers that the old system could not: who will actually
 * decide this, and can I add someone. The derived steps carry a lock — they
 * come from the org chart and the workflow, and a requester choosing their own
 * approver would defeat the point. Additions are appended, so a requester can
 * only make their request harder to pass.
 *
 * The derived steps follow personnel changes on their own: "Manager" reads the
 * requester's manager at submission, so a promotion needs no configuration
 * anywhere.
 */
export function ChainPicker({
  facts,
  colleagues,
  extraApproverIds,
  onChange,
}: {
  facts: ChainFacts;
  colleagues: { id: string; name: string; position?: string | null }[];
  extraApproverIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [steps, setSteps] = React.useState<ChainStep[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  // Re-resolved whenever the facts change, because the facts decide the route:
  // a purchase crossing $1,000 gains a Director step as you type the amount.
  const key = JSON.stringify({ ...facts, extraApproverIds });

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await previewChainAction({ ...facts, extraApproverIds });
      if (cancelled) return;
      setLoading(false);
      setError(res.ok ? null : (res.message ?? null));
      setSteps(res.steps);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const available = colleagues.filter((c) => !steps.some((s) => s.approverId === c.id));

  return (
    <Card>
      <CardHeader title={t('chain.title')} description={t('chain.subtitle')} />
      <CardBody className="space-y-2.5">
        {loading ? (
          <p className="flex items-center gap-2 py-2 text-xs text-text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {t('chain.resolving')}
          </p>
        ) : error ? (
          <p role="status" className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            {error}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {steps.map((step) => (
              <li
                key={`${step.order}-${step.approverId}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 py-2',
                  step.addedByRequester
                    ? 'border-accent-border bg-accent-soft/30'
                    : 'border-border-subtle bg-surface-sunken',
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                  {step.order}
                </span>
                <Avatar name={step.approverName} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text">{step.approverName}</span>
                  <span className="block truncate text-[10px] text-text-subtle">
                    {step.addedByRequester ? t('chain.youAdded') : t(`step.${step.name}`)}
                    {step.approverPosition ? ` · ${step.approverPosition}` : ''}
                  </span>
                </span>

                {step.addedByRequester ? (
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('chain.remove', { name: step.approverName })}
                    onClick={() => onChange(extraApproverIds.filter((id) => id !== step.approverId))}
                  >
                    <X />
                  </Button>
                ) : (
                  // Derived steps are not removable, and the icon says so rather
                  // than the button simply being absent.
                  <span title={t('chain.lockedHint')} className="shrink-0 text-text-subtle">
                    <Lock className="size-3.5" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {adding ? (
          <div className="flex gap-2">
            <Select
              autoFocus
              aria-label={t('chain.addApprover')}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onChange([...extraApproverIds, e.target.value]);
                setAdding(false);
              }}
              className="h-8 flex-1"
            >
              <option value="">{t('tpl.choose')}</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.position ? ` · ${c.position}` : ''}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t('action.cancel')}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={available.length === 0}>
            <UserPlus /> {t('chain.addApprover')}
          </Button>
        )}

        <p className="border-t border-border-subtle pt-2 text-[11px] leading-relaxed text-text-subtle">
          {t('chain.note')}
        </p>
      </CardBody>
    </Card>
  );
}

/** Small trigger used where space is tight. */
export function AddApproverHint() {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1 text-[11px] text-text-subtle">
      <Plus className="size-3" /> {t('chain.addApprover')}
    </span>
  );
}
