'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { EmployeePicker, type PickedPerson } from '@/components/ui/employee-picker';
import { TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table';
import { useT } from '@/lib/i18n/client';
import {
  deleteCostCenterAction,
  deleteDepartmentAction,
  deleteOfficeAction,
  deleteTeamAction,
  saveCostCenterAction,
  saveDepartmentAction,
  saveOfficeAction,
  saveTeamAction,
  type OrgResult,
} from '@/server/actions/organization';

export interface OrgOffice {
  id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  timezone: string;
  baseCurrency: string;
  headcount: number;
}
export interface OrgDept {
  id: string;
  code: string;
  name: string;
  officeId: string | null;
  officeCode: string | null;
  headId: string | null;
  headName: string | null;
  headPosition: string | null;
  headcount: number;
  routing: boolean;
}
export interface OrgTeam {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  departmentCode: string | null;
}
export interface OrgCostCenter {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  departmentCode: string | null;
  active: boolean;
}

type Kind = 'office' | 'dept' | 'team' | 'cc';
type Values = Record<string, string | boolean | null>;

/** One input in the edit dialog. */
type Spec =
  | { key: string; label: string; kind: 'text'; hint?: string; lockedOnEdit?: boolean; placeholder?: string }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; hint?: string; allowEmpty?: boolean }
  | { key: string; label: string; kind: 'person'; hint?: string }
  | { key: string; label: string; kind: 'checkbox' };

/**
 * Organization editing.
 *
 * This structure is not reference data — it decides who approves what.
 * `materializeSteps` resolves the HR, Finance and CEO approvers by reading a
 * department's code and taking that department's head, so the head field here
 * is the one that re-routes future approvals the moment it is saved.
 *
 * Two consequences are built in rather than explained in a note: codes are
 * disabled once created, because renaming one silently reroutes approvals; and
 * a row that anything still references cannot be deleted, so the server answers
 * with what is attached instead of cascading a department out from under 40
 * people.
 */
export function OrgManager({
  offices,
  departments,
  teams,
  costCenters,
}: {
  offices: OrgOffice[];
  departments: OrgDept[];
  teams: OrgTeam[];
  costCenters: OrgCostCenter[];
}) {
  const t = useT();
  const router = useRouter();

  const [kind, setKind] = React.useState<Kind | null>(null);
  const [values, setValues] = React.useState<Values>({});
  const [head, setHead] = React.useState<PickedPerson | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<OrgResult | null>(null);

  const officeOptions = offices.map((o) => ({ value: o.id, label: `${o.code} · ${o.name}` }));
  const deptOptions = departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }));

  const SPECS: Record<Kind, Spec[]> = {
    office: [
      { key: 'code', label: t('org.code'), kind: 'text', hint: t('org.codeHint'), lockedOnEdit: true, placeholder: 'OMH-KR' },
      { key: 'name', label: t('label.name'), kind: 'text' },
      { key: 'country', label: t('org.country'), kind: 'text' },
      { key: 'city', label: t('org.city'), kind: 'text' },
      { key: 'timezone', label: t('org.timezone'), kind: 'text', placeholder: 'Asia/Seoul' },
      { key: 'baseCurrency', label: t('org.baseCurrency'), kind: 'text', placeholder: 'KRW' },
    ],
    dept: [
      { key: 'code', label: t('org.code'), kind: 'text', hint: t('org.codeHint'), lockedOnEdit: true, placeholder: 'MKT' },
      { key: 'name', label: t('label.name'), kind: 'text' },
      { key: 'officeId', label: t('label.office'), kind: 'select', options: officeOptions },
      { key: 'headEmployeeId', label: t('org.head'), kind: 'person', hint: t('org.headHint') },
    ],
    team: [
      { key: 'code', label: t('org.code'), kind: 'text', hint: t('org.codeHint'), lockedOnEdit: true, placeholder: 'MKT-BRAND' },
      { key: 'name', label: t('label.name'), kind: 'text' },
      { key: 'departmentId', label: t('label.department'), kind: 'select', options: deptOptions },
    ],
    cc: [
      { key: 'code', label: t('org.code'), kind: 'text', hint: t('org.codeHint'), lockedOnEdit: true, placeholder: 'CC-MKT' },
      { key: 'name', label: t('label.name'), kind: 'text' },
      { key: 'departmentId', label: t('label.department'), kind: 'select', options: deptOptions, allowEmpty: true },
      { key: 'active', label: t('state.active'), kind: 'checkbox' },
    ],
  };

  function open(k: Kind, row?: Record<string, unknown>) {
    setKind(k);
    setResult(null);
    setEditingId((row?.id as string) ?? null);
    if (row) {
      const next: Values = {};
      for (const s of SPECS[k]) {
        const v = row[s.key === 'headEmployeeId' ? 'headId' : s.key];
        next[s.key] = s.kind === 'checkbox' ? Boolean(v) : ((v as string | null) ?? '');
      }
      setValues(next);
      setHead(
        k === 'dept' && row.headId
          ? { id: row.headId as string, name: (row.headName as string) ?? '', position: (row.headPosition as string) ?? null }
          : null,
      );
    } else {
      const blank: Values = {};
      for (const s of SPECS[k]) blank[s.key] = s.kind === 'checkbox' ? true : '';
      setValues(blank);
      setHead(null);
    }
  }

  async function save() {
    if (!kind) return;
    setBusy(true);
    const payload: Record<string, unknown> = { ...values, id: editingId };
    if (kind === 'dept') payload.headEmployeeId = head?.id ?? null;
    if (kind === 'team' || kind === 'cc') payload.departmentId = values.departmentId || null;
    if (kind === 'cc') payload.active = Boolean(values.active);

    const res =
      kind === 'office'
        ? await saveOfficeAction(payload)
        : kind === 'dept'
          ? await saveDepartmentAction(payload)
          : kind === 'team'
            ? await saveTeamAction(payload)
            : await saveCostCenterAction(payload);

    setBusy(false);
    setResult(res);
    if (res.ok) {
      setKind(null);
      router.refresh();
    }
  }

  async function remove(k: Kind, id: string, name: string) {
    if (!window.confirm(t('org.confirmDelete', { name }))) return;
    setBusy(true);
    const res =
      k === 'office'
        ? await deleteOfficeAction(id)
        : k === 'dept'
          ? await deleteDepartmentAction(id)
          : k === 'team'
            ? await deleteTeamAction(id)
            : await deleteCostCenterAction(id);
    setBusy(false);
    setResult(res);
    if (res.ok) router.refresh();
  }

  const rowActions = (k: Kind, row: { id: string; name: string }, canDelete = true) => (
    <span className="flex justify-end gap-0.5">
      <Button size="iconSm" variant="ghost" aria-label={t(EDIT_LABEL[k], { name: row.name })} onClick={() => open(k, row)}>
        <Pencil />
      </Button>
      {canDelete && (
        <Button
          size="iconSm"
          variant="ghost"
          disabled={busy}
          aria-label={t('org.deleteRow', { name: row.name })}
          onClick={() => remove(k, row.id, row.name)}
        >
          <Trash2 />
        </Button>
      )}
    </span>
  );

  const addButton = (k: Kind, label: string) => (
    <Button size="sm" variant="secondary" onClick={() => open(k)}>
      <Plus /> {label}
    </Button>
  );

  return (
    <>
      {/* One shared banner: the interesting outcome is almost always a refusal to
          delete, and it should not be hidden inside a dialog that just closed. */}
      {result && !result.ok && (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
        >
          {result.message}
        </p>
      )}
      {result?.ok && (
        <p
          role="status"
          className="mb-3 rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          {result.message}
        </p>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={t('org.offices', { count: offices.length })}
            icon={<Building2 className="size-4" />}
            actions={addButton('office', t('org.newOffice'))}
          />
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('org.code')}</TH>
                <TH>{t('label.name')}</TH>
                <TH>{t('org.location')}</TH>
                <TH>{t('org.timezone')}</TH>
                <TH>{t('org.baseCurrency')}</TH>
                <TH align="right">{t('org.headcount')}</TH>
                <TH align="right">{t('label.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {offices.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Badge tone="slate">{o.code}</Badge>
                  </TD>
                  <TD className="font-medium">{o.name}</TD>
                  <TD className="text-text-muted">
                    {o.city}, {o.country}
                  </TD>
                  <TD className="text-text-muted">{o.timezone}</TD>
                  <TD className="text-text-muted">{o.baseCurrency}</TD>
                  <TD numeric>{o.headcount}</TD>
                  <TD align="right">{rowActions('office', o)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader
            title={t('org.departments', { count: departments.length })}
            description={t('org.departmentsSub')}
            actions={addButton('dept', t('org.newDept'))}
          />
          <TableWrap>
            <THead>
              <TR>
                <TH>{t('org.code')}</TH>
                <TH>{t('label.name')}</TH>
                <TH>{t('label.office')}</TH>
                <TH>{t('org.head')}</TH>
                <TH align="right">{t('org.headcount')}</TH>
                <TH align="right">{t('label.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {departments.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      <Badge tone="slate">{d.code}</Badge>
                      {/* HR / FIN / CEO are how the engine finds those approvers. */}
                      {d.routing && <Badge tone="violet">{t('org.routingCode')}</Badge>}
                    </span>
                  </TD>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-text-muted">{d.officeCode ?? '—'}</TD>
                  <TD>
                    {d.headName && d.headId ? (
                      <Link href={`/people/${d.headId}`} className="flex items-center gap-1.5 hover:underline">
                        <Avatar name={d.headName} size="xs" />
                        {d.headName}
                      </Link>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">{t('org.headNotSet')}</span>
                    )}
                  </TD>
                  <TD numeric>{d.headcount}</TD>
                  <TD align="right">{rowActions('dept', d, !d.routing)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('org.teams', { count: teams.length })} actions={addButton('team', t('org.newTeam'))} />
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('org.code')}</TH>
                  <TH>{t('label.name')}</TH>
                  <TH>{t('label.department')}</TH>
                  <TH align="right">{t('label.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {teams.map((tm) => (
                  <TR key={tm.id}>
                    <TD className="font-mono text-xs">{tm.code}</TD>
                    <TD className="font-medium">{tm.name}</TD>
                    <TD className="text-text-muted">{tm.departmentCode ?? '—'}</TD>
                    <TD align="right">{rowActions('team', tm)}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader
              title={t('org.costCenters', { count: costCenters.length })}
              description={t('org.costCentersSub')}
              actions={addButton('cc', t('org.newCc'))}
            />
            <TableWrap>
              <THead>
                <TR>
                  <TH>{t('org.code')}</TH>
                  <TH>{t('label.name')}</TH>
                  <TH>{t('label.department')}</TH>
                  <TH>{t('label.status')}</TH>
                  <TH align="right">{t('label.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {costCenters.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-text-muted">{c.departmentCode ?? '—'}</TD>
                    <TD>
                      <Badge tone={c.active ? 'emerald' : 'slate'}>{t(c.active ? 'state.active' : 'state.inactive')}</Badge>
                    </TD>
                    <TD align="right">{rowActions('cc', c)}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </Card>
        </div>
      </div>

      <Dialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)}>
        {kind && (
          <DialogContent
            title={editingId ? t(EDIT_LABEL[kind], { name: (values.name as string) || '' }) : t(NEW_LABEL[kind])}
            description={editingId ? t('org.codeLocked') : undefined}
            footer={
              <>
                <Button variant="ghost" onClick={() => setKind(null)}>
                  {t('action.cancel')}
                </Button>
                <Button variant="primary" onClick={save} disabled={busy}>
                  {t('action.save')}
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              {SPECS[kind].map((s) => {
                const id = `org-${kind}-${s.key}`;
                if (s.kind === 'checkbox') {
                  return (
                    <label key={s.key} className="flex items-center gap-2 text-sm text-text">
                      <Checkbox
                        id={id}
                        checked={Boolean(values[s.key])}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.checked }))}
                      />
                      {s.label}
                    </label>
                  );
                }
                return (
                  <Field key={s.key} label={s.label} htmlFor={id} hint={s.hint}>
                    {s.kind === 'text' ? (
                      <Input
                        id={id}
                        value={(values[s.key] as string) ?? ''}
                        placeholder={s.placeholder}
                        disabled={Boolean(editingId && s.lockedOnEdit)}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                      />
                    ) : s.kind === 'select' ? (
                      <Select
                        id={id}
                        value={(values[s.key] as string) ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                      >
                        <option value="">{s.allowEmpty ? '—' : t('label.choose')}</option>
                        {s.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <EmployeePicker value={head} onChange={setHead} id={id} ariaLabel={s.label} />
                    )}
                  </Field>
                );
              })}

              {result && !result.ok && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {result.message}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

const NEW_LABEL: Record<Kind, string> = {
  office: 'org.newOffice',
  dept: 'org.newDept',
  team: 'org.newTeam',
  cc: 'org.newCc',
};

const EDIT_LABEL: Record<Kind, string> = {
  office: 'org.editOffice',
  dept: 'org.editDept',
  team: 'org.editTeam',
  cc: 'org.editCc',
};
