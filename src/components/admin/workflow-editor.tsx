'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Info, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui/primitives';
import { saveWorkflowAction, type AdminResult } from '@/server/actions/admin';
import { useT } from '@/lib/i18n/client';
import { APPROVER_ROLES } from '@/types/domain';
import { cn } from '@/lib/utils';

export interface WorkflowStepDto {
  name: string;
  approverRole: string;
  /** Fixed approver. Null means resolve `approverRole` per request. */
  approverEmployeeId: string | null;
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

export interface ApproverOption {
  id: string;
  name: string;
  position: string | null;
  departmentCode: string | null;
}

const CONDITIONS = [
  { value: 'ALWAYS', needsValue: false },
  { value: 'AMOUNT_GT', needsValue: true },
  { value: 'DAYS_GT', needsValue: true },
  { value: 'INTERNATIONAL', needsValue: false },
  { value: 'QUOTATIONS_LT', needsValue: true },
];

export function WorkflowEditor({ workflow, people }: { workflow: WorkflowDto; people: ApproverOption[] }) {
  const router = useRouter();
  const t = useT();
  const [steps, setSteps] = React.useState<WorkflowStepDto[]>(workflow.steps);
  const [description, setDescription] = React.useState(workflow.description ?? '');
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<AdminResult | null>(null);

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
        approverEmployeeId: s.approverEmployeeId,
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
        title={t(`type.${workflow.requestType}`)}
        description={t('wf.steps', { count: steps.length })}
        icon={<GitBranch className="size-4" />}
        actions={
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {t('action.save')}
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('label.description')}</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8" />
        </label>

        <ol className="space-y-2">
          {steps.map((step, i) => {
            const condition = CONDITIONS.find((c) => c.value === step.conditionType) ?? CONDITIONS[0];
            // A named approver is stored on the step; clearing it falls back to the role.
            const byPerson = step.approverEmployeeId !== null;

            return (
              <li key={i} className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                    {i + 1}
                  </span>
                  <Input
                    aria-label={t('wf.stepName', { n: i + 1 })}
                    value={step.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="h-8 flex-1"
                  />
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('wf.moveUp', { n: i + 1 })}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('wf.moveDown', { n: i + 1 })}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t('wf.removeStep', { n: i + 1 })}
                    disabled={steps.length === 1}
                    onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-text-muted">{t('wf.approverType')}</span>
                    <Select
                      value={byPerson ? 'PERSON' : 'ROLE'}
                      onChange={(e) =>
                        update(i, {
                          approverEmployeeId: e.target.value === 'PERSON' ? (people[0]?.id ?? null) : null,
                        })
                      }
                      className="h-8"
                    >
                      <option value="ROLE">{t('wf.byRole')}</option>
                      <option value="PERSON">{t('wf.byPerson')}</option>
                    </Select>
                  </label>

                  {byPerson ? (
                    <label className="block">
                      <span className="mb-1 block text-[10px] text-text-muted">{t('wf.namedApprover')}</span>
                      <Select
                        value={step.approverEmployeeId ?? ''}
                        onChange={(e) => update(i, { approverEmployeeId: e.target.value || null })}
                        className="h-8"
                      >
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.departmentCode ? ` · ${p.departmentCode}` : ''}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-[10px] text-text-muted">{t('wf.approver')}</span>
                      <Select
                        value={step.approverRole}
                        onChange={(e) => update(i, { approverRole: e.target.value })}
                        className="h-8"
                      >
                        {APPROVER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`approverRole.${r}`)}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-[10px] text-text-muted">{t('wf.slaHours')}</span>
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
                    <span className="mb-1 block text-[10px] text-text-muted">{t('wf.requiredWhen')}</span>
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
                          {t(`wf.cond.${c.value}`)}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className={cn('block', !condition.needsValue && 'opacity-40')}>
                    <span className="mb-1 block text-[10px] text-text-muted">{t('wf.threshold')}</span>
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

                <p className="mt-1.5 text-[10px] text-text-subtle">
                  {t(byPerson ? 'wf.byPersonHint' : 'wf.byRoleHint')} {t(`wf.cond.${condition.value}.hint`)}
                </p>
              </li>
            );
          })}
        </ol>

        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setSteps((p) => [
              ...p,
              {
                name: t('wf.newStep'),
                approverRole: 'MANAGER',
                approverEmployeeId: null,
                slaHours: 24,
                conditionType: 'ALWAYS',
                conditionValue: null,
              },
            ])
          }
          disabled={steps.length >= 8}
        >
          <Plus /> {t('wf.addStep')}
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
          {t('wf.appliesNote')}
        </p>
      </CardBody>
    </Card>
  );
}
