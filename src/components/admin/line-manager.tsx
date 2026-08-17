'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, GitBranch, Loader2, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { EmployeePicker } from '@/components/ui/employee-picker';
import { EmptyState } from '@/components/ui/states';
import { deleteOrgLineAction, saveOrgLineAction, type LineResult } from '@/server/actions/approval-lines';
import { useI18n } from '@/lib/i18n/client';

export interface AdminLineDto {
  id: string;
  name: string;
  requestType: string | null;
  officeId: string | null;
  officeCode: string | null;
  isActive: boolean;
  sortOrder: number;
  uses: number;
  members: { employeeId: string; name: string; position: string | null; departmentCode: string | null }[];
}

interface Member {
  id: string;
  name: string;
  position: string | null;
}

/**
 * Organization approval lines.
 *
 * A line is the list of people a requester picks instead of assembling the same
 * approvers every week. It is not the workflow — the workflow derives a route
 * from the request's facts; a line names people. Both exist because the derived
 * route is right most of the time and a named list is right the rest of it.
 *
 * Deleting one does not disturb history: steps are materialized at submission,
 * so a request keeps the approvers it was actually routed to. The use count is
 * shown for judgement, not as a block.
 */
export function LineManager({
  lines,
  offices,
  requestTypes,
}: {
  lines: AdminLineDto[];
  offices: { id: string; code: string; name: string }[];
  requestTypes: string[];
}) {
  const { t, tOr } = useI18n();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [requestType, setRequestType] = React.useState('');
  const [officeId, setOfficeId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<LineResult | null>(null);

  function openNew() {
    setEditingId(null);
    setName('');
    setRequestType('');
    setOfficeId('');
    setIsActive(true);
    setMembers([]);
    setResult(null);
    setOpen(true);
  }

  function openEdit(line: AdminLineDto) {
    setEditingId(line.id);
    setName(line.name);
    setRequestType(line.requestType ?? '');
    setOfficeId(line.officeId ?? '');
    setIsActive(line.isActive);
    setMembers(line.members.map((m) => ({ id: m.employeeId, name: m.name, position: m.position })));
    setResult(null);
    setOpen(true);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= members.length) return;
    const next = [...members];
    [next[index], next[target]] = [next[target], next[index]];
    setMembers(next);
  }

  async function save() {
    setBusy(true);
    const res = await saveOrgLineAction({
      id: editingId,
      name,
      approverIds: members.map((m) => m.id),
      requestType: requestType || null,
      officeId: officeId || null,
      isActive,
      sortOrder: 100,
    });
    setBusy(false);
    setResult(res);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(line: AdminLineDto) {
    const warning = line.uses > 0 ? t('line.confirmDeleteUsed', { name: line.name, count: line.uses }) : t('line.confirmDelete', { name: line.name });
    if (!window.confirm(warning)) return;
    setBusy(true);
    const res = await deleteOrgLineAction(line.id);
    setBusy(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  return (
    <>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={
            result.ok
              ? 'mb-3 rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'mb-3 rounded-[var(--radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
          }
        >
          {result.message}
        </p>
      )}

      <Card>
        <CardHeader
          title={t('line.listTitle', { count: lines.length })}
          description={t('line.listSubtitle')}
          icon={<GitBranch className="size-4" />}
          actions={
            <Button size="sm" variant="secondary" onClick={openNew}>
              <Plus /> {t('line.new')}
            </Button>
          }
        />
        {lines.length === 0 ? (
          <EmptyState title={t('line.empty')} description={t('line.emptyHint')} className="py-10" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-text">{line.name}</span>
                    {!line.isActive && <Badge tone="slate">{t('state.inactive')}</Badge>}
                    {line.requestType ? (
                      <Badge tone="slate">{tOr(`type.${line.requestType}`, line.requestType)}</Badge>
                    ) : (
                      <Badge tone="slate">{t('line.anyType')}</Badge>
                    )}
                    {line.officeCode && <Badge tone="slate">{line.officeCode}</Badge>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-text-muted">
                    {line.members.length === 0 ? (
                      <span className="text-rose-600 dark:text-rose-400">{t('line.noMembers')}</span>
                    ) : (
                      line.members.map((m, i) => (
                        <span key={m.employeeId} className="flex items-center gap-1">
                          {i > 0 && <span className="text-text-subtle">→</span>}
                          <Avatar name={m.name} size="xs" />
                          {m.name}
                        </span>
                      ))
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-text-subtle">{t('line.uses', { count: line.uses })}</span>
                <span className="flex shrink-0">
                  <Button size="iconSm" variant="ghost" aria-label={t('line.edit', { name: line.name })} onClick={() => openEdit(line)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('line.delete', { name: line.name })}
                    onClick={() => remove(line)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editingId ? t('line.editTitle') : t('line.newTitle')}
          description={t('line.dialogNote')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('action.cancel')}
              </Button>
              <Button variant="primary" onClick={save} disabled={busy || members.length === 0 || name.trim().length < 2}>
                {busy && <Loader2 className="animate-spin" />}
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label={t('line.nameLabel')} htmlFor="line-name">
              <Input id="line-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('line.namePlaceholder')} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('line.requestType')} htmlFor="line-type" hint={t('line.requestTypeHint')}>
                <Select id="line-type" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                  <option value="">{t('line.anyType')}</option>
                  {requestTypes.map((ty) => (
                    <option key={ty} value={ty}>
                      {tOr(`type.${ty}`, ty)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('label.office')} htmlFor="line-office" hint={t('line.officeHint')}>
                <Select id="line-office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                  <option value="">{t('line.allOffices')}</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('line.members')}</span>
              {members.length === 0 ? (
                <p className="py-2 text-xs text-text-muted">{t('line.noMembersYet')}</p>
              ) : (
                <ol className="space-y-1.5">
                  {members.map((m, i) => (
                    <li
                      key={`${m.id}-${i}`}
                      className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2 py-1.5"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                        {i + 1}
                      </span>
                      <Avatar name={m.name} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-text">{m.name}</span>
                        {m.position && <span className="block truncate text-[10px] text-text-subtle">{m.position}</span>}
                      </span>
                      <span className="flex shrink-0">
                        <Button size="iconSm" variant="ghost" aria-label={t('chain.moveUp', { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          aria-label={t('chain.moveDown', { n: i + 1 })}
                          disabled={i === members.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          aria-label={t('chain.remove', { name: m.name })}
                          onClick={() => setMembers(members.filter((_, idx) => idx !== i))}
                        >
                          <X />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {adding ? (
                <div className="mt-2 flex gap-2">
                  <div className="flex-1">
                    <EmployeePicker
                      value={null}
                      ariaLabel={t('line.addMember')}
                      onChange={(person) => {
                        if (person && !members.some((m) => m.id === person.id)) {
                          setMembers([...members, { id: person.id, name: person.name, position: person.position ?? null }]);
                        }
                        setAdding(false);
                      }}
                    />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                    {t('action.cancel')}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setAdding(true)}>
                  <UserPlus /> {t('line.addMember')}
                </Button>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-text">
              <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t('line.isActive')}
            </label>

            {result && !result.ok && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {result.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CardBody className="px-0 pt-4 pb-0">
        <p className="max-w-3xl text-[11px] leading-relaxed text-text-subtle">{t('line.footnote')}</p>
      </CardBody>
    </>
  );
}
