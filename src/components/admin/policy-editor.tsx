'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Input, Select, Textarea } from '@/components/ui/primitives';
import { savePolicyAction, type AdminResult } from '@/server/actions/admin';
import { REQUEST_TYPE_META, type RequestType } from '@/types/domain';
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
        title={policy.name}
        description={`Applies to ${REQUEST_TYPE_META[policy.appliesTo as RequestType]?.label ?? policy.appliesTo} · ${humanize(policy.metric)}`}
        icon={<ShieldCheck className="size-4" />}
        actions={
          <span className="flex items-center gap-2">
            <Badge tone={severity === 'BLOCKING' ? 'rose' : 'amber'}>{humanize(severity)}</Badge>
            <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || pending} onClick={save}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </span>
        }
      />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={cn('block', !numericMetric && 'opacity-40')}>
            <span className="mb-1 block text-[11px] font-medium text-text-muted">
              Threshold {unit && <span className="text-text-subtle">({unit})</span>}
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
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Severity</span>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-8">
              <option value="WARNING">Warning — approver may proceed</option>
              <option value="BLOCKING">Blocking — needs an explicit override</option>
            </Select>
          </label>

          <label className="flex items-end gap-2 pb-1.5 text-xs text-text">
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Policy is active
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-muted">Message shown to approvers</span>
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
          Code <code className="font-mono">{policy.code}</code>. Evaluated against every new request of this type and
          re-evaluated whenever the analysis is refreshed.{' '}
          <strong className="text-text">Blocking</strong> policies do not prevent submission — they require the approver
          to record a reason, which is stored in the audit log.
        </p>
      </CardBody>
    </Card>
  );
}
