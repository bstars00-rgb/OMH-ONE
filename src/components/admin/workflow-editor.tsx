'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Info, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui/primitives';
import { saveWorkflowAction, type AdminResult } from '@/server/actions/admin';
import { APPROVER_ROLES, REQUEST_TYPE_META, type RequestType } from '@/types/domain';
import { humanize } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface WorkflowStepDto {
  name: string;
  approverRole: string;
  slaHours: number;
  conditionType: string;
  conditionValue: string | null;
}

export interface WorkflowDto {
  id: string;
  name: string;
  requestType: string;
  description: string | null;
  steps: WorkflowStepDto[];
}

const CONDITIONS = [
  { value: 'ALWAYS', label: 'Always', needsValue: false, hint: 'This step is always required.' },
  { value: 'AMOUNT_GT', label: 'Amount above', needsValue: true, hint: 'Only when the request value exceeds this figure.' },
  { value: 'DAYS_GT', label: 'Days above', needsValue: true, hint: 'Only when the duration exceeds this many days.' },
  { value: 'INTERNATIONAL', label: 'International travel', needsValue: false, hint: 'Only when the trip crosses a border.' },
  { value: 'QUOTATIONS_LT', label: 'Quotations fewer than', needsValue: true, hint: 'Only when fewer quotations are attached.' },
];

export function WorkflowEditor({ workflow }: { workflow: WorkflowDto }) {
  const router = useRouter();
  const [steps, setSteps] = React.useState<WorkflowStepDto[]>(workflow.steps);
  const [description, setDescription] = React.useState(workflow.description ?? '');
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<AdminResult | null>(null);

  const meta = REQUEST_TYPE_META[workflow.requestType as RequestType];
  const dirty =
    JSON.stringify(steps) !== JSON.stringify(workflow.steps) || description !== (workflow.description ?? '');

  function update(i: number, patch: Partial<WorkflowStepDto>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setPending(true);
    setResult(null);
    const res = await saveWorkflowAction({
      workflowId: workflow.id,
      description,
      steps: steps.map((s) => ({
        name: s.name,
        approverRole: s.approverRole,
        slaHours: s.slaHours,
        conditionType: s.conditionType,
        conditionValue: s.conditionValue === null || s.conditionValue === '' ? null : Number(s.conditionValue),
      })),
    });
    setPending(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title={meta?.label ?? workflow.name}
        description={`${steps.length} step${steps.length === 1 ? '' : 's'} · ${meta?.prefix ?? ''}`}
        icon={<GitBranch className="size-4" />}
        actions={
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-muted">Description</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8" />
        </label>

        <ol className="space-y-2">
          {steps.map((step, i) => {
            const condition = CONDITIONS.find((c) => c.value === step.conditionType) ?? CONDITIONS[0];
            return (
              <li key={i} className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                    {i + 1}
                  </span>
                  <Input
                    aria-label={`Step ${i + 1} name`}
                    value={step.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="h-8 flex-1"
                  />
                  <Button size="iconSm" variant="ghost" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={steps.length === 1}
                    onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-text-muted">Approver</span>
                    <Select value={step.approverRole} onChange={(e) => update(i, { approverRole: e.target.value })} className="h-8">
                      {APPROVER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {humanize(r)}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] text-text-muted">SLA (hours)</span>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={step.slaHours}
                      onChange={(e) => update(i, { slaHours: Number(e.target.value) })}
                      className="h-8"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] text-text-muted">Required when</span>
                    <Select
                      value={step.conditionType}
                      onChange={(e) =>
                        update(i, {
                          conditionType: e.target.value,
                          conditionValue: CONDITIONS.find((c) => c.value === e.target.value)?.needsValue
                            ? (step.conditionValue ?? '0')
                            : null,
                        })
                      }
                      className="h-8"
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className={cn('block', !condition.needsValue && 'opacity-40')}>
                    <span className="mb-1 block text-[10px] text-text-muted">Threshold</span>
                    <Input
                      type="number"
                      min={0}
                      disabled={!condition.needsValue}
                      value={step.conditionValue ?? ''}
                      onChange={(e) => update(i, { conditionValue: e.target.value })}
                      className="h-8"
                    />
                  </label>
                </div>

                <p className="mt-1.5 text-[10px] text-text-subtle">{condition.hint}</p>
              </li>
            );
          })}
        </ol>

        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setSteps((p) => [...p, { name: 'New step', approverRole: 'MANAGER', slaHours: 24, conditionType: 'ALWAYS', conditionValue: null }])
          }
          disabled={steps.length >= 8}
        >
          <Plus /> Add step
        </Button>

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

        <p className="flex gap-1.5 border-t border-border-subtle pt-2.5 text-[11px] text-text-subtle">
          <Info className="mt-px size-3 shrink-0" />
          Changes apply to requests submitted from now on. Requests already in the chain keep the route they were given
          at submission, so approval history is never rewritten.
        </p>
      </CardBody>
    </Card>
  );
}
