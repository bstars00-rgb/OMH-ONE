'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { createPolicyAction, type AdminResult } from '@/server/actions/admin';
import { POLICY_METRIC_KEYS, metricTakesThreshold, typesForMetric, POLICY_METRICS } from '@/lib/validation/policies';
import { useI18n } from '@/lib/i18n/client';

/**
 * Adds a policy.
 *
 * The rule is picked first, and everything else follows from it: the request
 * types narrow to the ones that actually carry that rule's facts, and the
 * threshold field disappears for rules that do not take one. That ordering is
 * the whole point — a policy on a type it cannot measure is a row that sits on
 * this page looking enforced and never fires once.
 *
 * The list of rules is the list of branches the evaluator implements. A genuinely
 * new *kind* of check needs code, and the dialog says so rather than offering a
 * free-text metric field that would quietly do nothing.
 */
export function PolicyCreator() {
  const router = useRouter();
  const { t, tOr } = useI18n();

  const [open, setOpen] = React.useState(false);
  const [metric, setMetric] = React.useState<string>(POLICY_METRIC_KEYS[0]);
  const [appliesTo, setAppliesTo] = React.useState<string>(typesForMetric(POLICY_METRIC_KEYS[0])[0] ?? '');
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [threshold, setThreshold] = React.useState('');
  const [severity, setSeverity] = React.useState('WARNING');
  const [message, setMessage] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<AdminResult | null>(null);

  const types = typesForMetric(metric);
  const takesThreshold = metricTakesThreshold(metric);
  const isDays = POLICY_METRICS[metric as keyof typeof POLICY_METRICS]?.threshold === 'days';

  function pickMetric(next: string) {
    setMetric(next);
    // Keep the type valid for the new rule instead of leaving a pair that the
    // server would only reject on submit.
    const allowed = typesForMetric(next);
    setAppliesTo((cur) => (allowed.includes(cur) ? cur : (allowed[0] ?? '')));
  }

  async function create() {
    setPending(true);
    setResult(null);
    const res = await createPolicyAction({
      code,
      name,
      metric,
      appliesTo,
      threshold: takesThreshold && threshold !== '' ? Number(threshold) : null,
      severity,
      message,
      isActive,
    });
    setPending(false);
    setResult(res);
    if (res.ok) {
      setOpen(false);
      setCode('');
      setName('');
      setThreshold('');
      setMessage('');
      router.refresh();
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus /> {t('pol.new')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t('pol.newTitle')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('action.cancel')}
              </Button>
              <Button variant="primary" onClick={create} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label={t('pol.metric')} htmlFor="pol-metric" hint={t('pol.metricHint')}>
              <Select id="pol-metric" value={metric} onChange={(e) => pickMetric(e.target.value)}>
                {POLICY_METRIC_KEYS.map((m) => (
                  <option key={m} value={m}>
                    {t(`policyMetric.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('pol.appliesToLabel')} htmlFor="pol-type">
              <Select id="pol-type" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
                {types.map((ty) => (
                  <option key={ty} value={ty}>
                    {tOr(`type.${ty}`, ty)}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('pol.codeLabel')} htmlFor="pol-code" hint={t('pol.codeHint')}>
                <Input
                  id="pol-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="POL-HOTEL-KR"
                />
              </Field>
              <Field label={t('pol.nameLabel')} htmlFor="pol-name">
                <Input id="pol-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={isDays ? t('pol.thresholdDays') : t('pol.thresholdLabel')}
                htmlFor="pol-threshold"
                hint={takesThreshold ? undefined : t('pol.noThreshold')}
              >
                <Input
                  id="pol-threshold"
                  type="number"
                  min={0}
                  step={isDays ? '1' : '0.01'}
                  disabled={!takesThreshold}
                  value={takesThreshold ? threshold : ''}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </Field>
              <Field label={t('pol.severity')} htmlFor="pol-severity">
                <Select id="pol-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="WARNING">{t('pol.severityWarning')}</option>
                  <option value="BLOCKING">{t('pol.severityBlocking')}</option>
                </Select>
              </Field>
            </div>

            <Field label={t('pol.message')} htmlFor="pol-message">
              <Textarea id="pol-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-text">
              <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t('pol.isActive')}
            </label>

            {result && !result.ok && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {result.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
