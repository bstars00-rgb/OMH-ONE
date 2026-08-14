'use client';

import * as React from 'react';
import { CalendarDays, Info } from 'lucide-react';
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea, Progress } from '@/components/ui/primitives';
import { AiDraftBox, FieldError, FormActions, useCreateForm } from './form-shell';
import { createLeaveAction } from '@/server/actions/create';
import { calcWorkingDays, formatRange, toISODate } from '@/lib/dates';
import { LEAVE_TYPES } from '@/types/domain';
import { humanize } from '@/lib/utils';
import type { LeaveFormData } from '@/server/queries/form-context';

export function LeaveForm({
  data,
  holidays,
}: {
  data: LeaveFormData;
  holidays: { holidayDate: string; name: string }[];
}) {
  const today = toISODate(new Date());
  const [leaveType, setLeaveType] = React.useState<string>('ANNUAL');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [halfDayStart, setHalfDayStart] = React.useState(false);
  const [halfDayEnd, setHalfDayEnd] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [emergencyContact, setEmergencyContact] = React.useState('');
  const [handoverTo, setHandoverTo] = React.useState('');

  const { pending, result, errors, run } = useCreateForm();

  // Working days are computed live, using the same calculator the server uses —
  // the user should never be surprised by the number after submitting.
  const calc = React.useMemo(
    () =>
      startDate && endDate && endDate >= startDate
        ? calcWorkingDays(startDate, endDate, holidays, { halfDayStart, halfDayEnd })
        : null,
    [startDate, endDate, halfDayStart, halfDayEnd, holidays],
  );

  const balance = data.balances.find((b) => b.leaveType === leaveType);
  const remainingAfter = balance && calc ? balance.remaining - calc.workingDays : null;
  const overdrawn = remainingAfter !== null && remainingAfter < 0;

  function payload() {
    return { leaveType, startDate, endDate, halfDayStart, halfDayEnd, reason, emergencyContact, handoverTo };
  }

  function applyDraft(fields: Record<string, unknown>) {
    if (typeof fields.leaveType === 'string') setLeaveType(fields.leaveType);
    if (typeof fields.startDate === 'string') setStartDate(fields.startDate);
    if (typeof fields.endDate === 'string') setEndDate(fields.endDate);
    if (typeof fields.reason === 'string') setReason(fields.reason);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <AiDraftBox type="LEAVE" onDraft={applyDraft} />

        <Card>
          <CardHeader title="Leave detail" icon={<CalendarDays className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Leave type" htmlFor="leaveType" required error={errors.leaveType}>
              <Select id="leaveType" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Hand over to"
              htmlFor="handoverTo"
              hint="Who covers your work while you are away."
              error={errors.handoverTo}
            >
              <Select id="handoverTo" value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)}>
                <option value="">Not assigned</option>
                {data.colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="First day" htmlFor="startDate" required error={errors.startDate}>
              <Input
                id="startDate"
                type="date"
                min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-describedby={errors.startDate ? 'startDate-error' : undefined}
              />
            </Field>

            <Field label="Last day" htmlFor="endDate" required error={errors.endDate}>
              <Input
                id="endDate"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-describedby={errors.endDate ? 'endDate-error' : undefined}
              />
            </Field>

            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs text-text">
                <Checkbox checked={halfDayStart} onChange={(e) => setHalfDayStart(e.target.checked)} />
                Half day on the first day
              </label>
              <label className="flex items-center gap-2 text-xs text-text">
                <Checkbox checked={halfDayEnd} onChange={(e) => setHalfDayEnd(e.target.checked)} />
                Half day on the last day
              </label>
            </div>

            <Field label="Reason" htmlFor="reason" className="sm:col-span-2" error={errors.reason}>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>

            <Field
              label="Emergency contact"
              htmlFor="emergencyContact"
              hint="Optional — a number your manager can reach you on."
              error={errors.emergencyContact}
            >
              <Input
                id="emergencyContact"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        <FieldError id="form-error" message={errors._form} />

        <FormActions
          onSave={() => run((submitNow) => createLeaveAction(payload(), submitNow), false)}
          onSubmit={() => run((submitNow) => createLeaveAction(payload(), submitNow), true)}
          pending={pending}
          result={result}
          disabled={!startDate || !endDate}
        />
      </div>

      {/* Live calculation panel — this is the "AI does the arithmetic" promise, visible */}
      <aside className="space-y-4">
        <Card>
          <CardHeader title="Your balance" />
          <CardBody className="space-y-3">
            {data.balances.length === 0 ? (
              <p className="text-xs text-text-muted">No balance is configured for you this year.</p>
            ) : (
              data.balances.map((b) => (
                <div key={b.leaveType}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-medium text-text">{humanize(b.leaveType)}</span>
                    <span className="text-text-muted tabular">
                      {b.remaining} of {b.allowance} left
                    </span>
                  </div>
                  <Progress value={b.used + b.pending} max={b.allowance} label={`${b.leaveType} used`} />
                  <p className="mt-1 text-[10px] text-text-subtle tabular">
                    {b.used} used · {b.pending} pending approval
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card className={calc ? '' : 'opacity-60'}>
          <CardHeader title="This request" />
          <CardBody className="space-y-2 text-xs">
            {!calc ? (
              <p className="text-text-muted">Pick a start and end date to see the calculation.</p>
            ) : (
              <>
                <Row label="Period" value={formatRange(startDate, endDate)} />
                <Row label="Calendar days" value={String(calc.calendarDays)} />
                <Row label="Weekend days" value={String(calc.weekendDays)} />
                <Row
                  label="Public holidays"
                  value={calc.holidayDays > 0 ? `${calc.holidayDays} (${calc.holidayNames.join(', ')})` : '0'}
                />
                <Row label="Working days deducted" value={String(calc.workingDays)} strong />
                {remainingAfter !== null && (
                  <Row
                    label="Balance after approval"
                    value={`${remainingAfter} days`}
                    strong
                    tone={overdrawn ? 'bad' : 'good'}
                  />
                )}

                {overdrawn && (
                  <p className="flex gap-1.5 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                    <Info className="mt-px size-3 shrink-0" />
                    This exceeds your remaining balance by {Math.abs(remainingAfter!)} day(s). You can still submit it —
                    HR will see the shortfall on the approval screen.
                  </p>
                )}
                {calc.workingDays > 10 && (
                  <p className="flex gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                    <Info className="mt-px size-3 shrink-0" />
                    More than 10 consecutive working days — this will also need Director approval.
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span
        className={
          tone === 'bad'
            ? 'font-semibold text-rose-600 tabular dark:text-rose-400'
            : tone === 'good'
              ? 'font-semibold text-emerald-600 tabular dark:text-emerald-400'
              : strong
                ? 'font-semibold text-text tabular'
                : 'text-text tabular'
        }
      >
        {value}
      </span>
    </div>
  );
}
