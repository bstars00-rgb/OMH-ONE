'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Input, Select, Textarea } from '@/components/ui/primitives';
import { deletePolicyAction, savePolicyAction, type AdminResult } from '@/server/actions/admin';
import { useI18n } from '@/lib/i18n/client';
import { cn, humanize } from '@/lib/utils';

export interface PolicyDto {
  id: string;
  code: string;
  name: string;
  appliesTo: string;
  metric: string;
  operator: string;
  threshold: string | null;
  thresholdText: string | null;
  severity: string;
  message: string;
  isActive: boolean;
}

const METRIC_UNIT: Record<string, string> = {
  HOTEL_PER_NIGHT: 'USD per night',
  MEAL_PER_DAY: 'USD per day',
  PR_TOTAL: 'USD total',
  LEAVE_CONSECUTIVE: 'working days',
  BUDGET_REMAINING: 'USD',
  FLIGHT_CLASS: '',
};

export function PolicyEditor({ policy }: { policy: PolicyDto }) {
  const router = useRouter();
  const { t, tOr } = useI18n();
  const [threshold, setThreshold] = React.useState(policy.threshold ?? '');
  const [severity, setSeverity] = React.useState(policy.severity);
  const [message, setMessage] = React.useState(policy.message);
  const [isActive, setIsActive] = React.useState(policy.isActive);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<AdminResult | null>(null);

  const dirty =
    threshold !== (policy.threshold ?? '') ||
    severity !== policy.severity ||
    message !== policy.message ||
    isActive !== policy.isActive;

  const unit = METRIC_UNIT[policy.metric] ?? '';
  const numericMetric = unit !== '';

  const name = tOr(`policyName.${policy.code}`, policy.name);

  async function remove() {
    if (!window.confirm(t('pol.confirmDelete', { name }))) return;
    setPending(true);
    setResult(null);
    const res = await deletePolicyAction(policy.id);
    setPending(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  async function save() {
    setPending(true);
    setResult(null);
    const res = await savePolicyAction({
      policyId: policy.id,
      threshold: numericMetric && threshold !== '' ? Number(threshold) : null,
      severity,
      message,
      isActive,
    });
    setPending(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  return (
    <Card className={cn(!isActive && 'opacity-70')}>
      <CardHeader
        title={tOr(`policyName.${policy.code}`, policy.name)}
        description={t('pol.appliesTo', {
          type: tOr(`type.${policy.appliesTo}`, policy.appliesTo),
          metric: tOr(`policyMetric.${policy.metric}`, humanize(policy.metric)),
        })}
        icon={<ShieldCheck className="size-4" />}
        actions={
          <span className="flex items-center gap-2">
            <Badge tone={severity === 'BLOCKING' ? 'rose' : 'amber'}>{t(`policySeverity.${severity}`)}</Badge>
            <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || pending} onClick={save}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('action.save')}
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              disabled={pending}
              aria-label={t('pol.deleteRow', { name })}
              onClick={remove}
            >
              <Trash2 />
            </Button>
          </span>
        }
      />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={cn('block', !numericMetric && 'opacity-40')}>
            <span className="mb-1 block text-[11px] font-medium text-text-muted">
              {t('pol.thresholdLabel')}{' '}
              {unit && <span className="text-text-subtle">({tOr(`policyUnit.${policy.metric}`, unit)})</span>}
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={!numericMetric}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="h-8"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('pol.severity')}</span>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-8">
              <option value="WARNING">{t('pol.severityWarning')}</option>
              <option value="BLOCKING">{t('pol.severityBlocking')}</option>
            </Select>
          </label>

          <label className="flex items-end gap-2 pb-1.5 text-xs text-text">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t('pol.isActive')}
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('pol.message')}</span>
          <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>

        {result && (
          <p
            role="status"
            className={cn(
              'rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium',
              result.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
            )}
          >
            {result.message}
          </p>
        )}

        <p className="text-[11px] text-text-subtle">
          <code className="font-mono">{policy.code}</code> · {t('pol.codeNote')}
        </p>
      </CardBody>
    </Card>
  );
}
