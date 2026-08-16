'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Loader2, Save, UserPlus, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui/primitives';
import { previewChainAction } from '@/server/actions/chain-preview';
import { saveMyLineAction } from '@/server/actions/approval-lines';
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

export interface LineOption {
  id: string;
  name: string;
  ownerId: string | null;
  members: { employeeId: string; name: string; position: string | null }[];
}

export interface Colleague {
  id: string;
  name: string;
  position?: string | null;
}

/**
 * The approval line, as the company already works with it.
 *
 * A saved line fills the approver row; the row is then editable — remove
 * someone, add someone, reorder. That combination is the point: presets stop
 * the same team re-picking five people every week, and editability stops the
 * one unusual request going back to email.
 *
 * The system does not forbid edits. It records them: submitting a chain that
 * differs from the suggestion sets `chainEdited`, so an approver sees the route
 * was not standard and an auditor can find it later.
 */
export function ChainPicker({
  facts,
  colleagues,
  lines,
  value,
  onChange,
  onLineChange,
}: {
  facts: ChainFacts;
  colleagues: Colleague[];
  lines: LineOption[];
  /** Ordered approver ids. Empty means "use the suggested route". */
  value: string[];
  onChange: (ids: string[]) => void;
  onLineChange?: (lineId: string | null) => void;
}) {
  const { t } = useI18n();

  const [suggested, setSuggested] = React.useState<string[]>([]);
  /*
   * Names for everyone who can appear on the chain.
   *
   * `colleagues` is the requester's own department, so it does not contain the
   * HR or Finance head the derived route routes to — looking names up there
   * alone rendered half the chain as "미지정". The preview returns the names it
   * resolved, and saved lines carry theirs, so both feed this map.
   */
  const [names, setNames] = React.useState<Map<string, { name: string; position: string | null }>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lineId, setLineId] = React.useState<string>('');
  const [adding, setAdding] = React.useState(false);
  const [savingName, setSavingName] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<string | null>(null);

  const directory = React.useMemo(() => {
    const map = new Map(names);
    for (const c of colleagues) if (!map.has(c.id)) map.set(c.id, { name: c.name, position: c.position ?? null });
    for (const l of lines) {
      for (const m of l.members) if (!map.has(m.employeeId)) map.set(m.employeeId, { name: m.name, position: m.position });
    }
    return map;
  }, [names, colleagues, lines]);

  const nameOf = React.useCallback((id: string) => directory.get(id)?.name ?? t('org.headNotSet'), [directory, t]);
  const titleOf = React.useCallback((id: string) => directory.get(id)?.position ?? null, [directory]);

  // The suggested route depends on the facts — a purchase crossing $1,000 gains
  // a Director — so it is re-resolved as the form changes, but only replaces
  // the chips while the requester has not taken over.
  const factsKey = JSON.stringify(facts);
  const touched = value.length > 0;

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await previewChainAction(facts);
      if (cancelled) return;
      setLoading(false);
      setError(res.ok ? null : (res.message ?? null));
      const ids = res.steps.map((s) => s.approverId).filter(Boolean) as string[];
      setSuggested(ids);
      setNames((prev) => {
        const next = new Map(prev);
        for (const step of res.steps) {
          if (step.approverId) next.set(step.approverId, { name: step.approverName, position: step.approverPosition });
        }
        return next;
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey]);

  /** What is actually shown and submitted. */
  const chain = touched ? value : suggested;
  const available = [...directory.entries()]
    .filter(([id]) => !chain.includes(id))
    .map(([id, v]) => ({ id, name: v.name, position: v.position }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function applyLine(id: string) {
    setLineId(id);
    onLineChange?.(id || null);
    if (!id) {
      onChange([]); // back to the suggested route
      return;
    }
    const line = lines.find((l) => l.id === id);
    if (line) onChange(line.members.map((m) => m.employeeId));
  }

  function move(index: number, delta: number) {
    const next = [...chain];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  async function saveAsMine() {
    if (!savingName?.trim() || chain.length === 0) return;
    const res = await saveMyLineAction(savingName.trim(), chain, facts.requestType);
    setSaveState(res.message);
    if (res.ok) setSavingName(null);
  }

  const orgLines = lines.filter((l) => !l.ownerId);
  const myLines = lines.filter((l) => l.ownerId);

  return (
    <Card>
      <CardHeader title={t('chain.title')} description={t('chain.subtitle')} />
      <CardBody className="space-y-3">
        {/* Preset */}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('chain.line')}</span>
          <Select value={lineId} onChange={(e) => applyLine(e.target.value)} className="h-8">
            <option value="">{t('chain.autoLine')}</option>
            {myLines.length > 0 && (
              <optgroup label={t('chain.myLines')}>
                {myLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            )}
            {orgLines.length > 0 && (
              <optgroup label={t('chain.orgLines')}>
                {orgLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </label>

        {/* Approvers */}
        <div>
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
            {t('chain.approvers')}
            {touched && <Badge tone="amber">{t('chain.edited')}</Badge>}
          </span>

          {loading ? (
            <p className="flex items-center gap-2 py-2 text-xs text-text-muted">
              <Loader2 className="size-3.5 animate-spin" /> {t('chain.resolving')}
            </p>
          ) : error ? (
            <p
              role="status"
              className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
            >
              {error}
            </p>
          ) : chain.length === 0 ? (
            <p className="py-2 text-xs text-text-muted">{t('chain.empty')}</p>
          ) : (
            <ol className="space-y-1.5">
              {chain.map((id, i) => (
                <li
                  key={`${id}-${i}`}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-control)] border px-2 py-1.5',
                    'border-border-subtle bg-surface-sunken',
                  )}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                    {i + 1}
                  </span>
                  <Avatar name={nameOf(id)} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-text">{nameOf(id)}</span>
                    {titleOf(id) && <span className="block truncate text-[10px] text-text-subtle">{titleOf(id)}</span>}
                  </span>
                  <span className="flex shrink-0">
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t('chain.moveUp', { n: i + 1 })}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t('chain.moveDown', { n: i + 1 })}
                      disabled={i === chain.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t('chain.remove', { name: nameOf(id) })}
                      onClick={() => onChange(chain.filter((_, idx) => idx !== i))}
                    >
                      <X />
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Add */}
        {adding ? (
          <div className="flex gap-2">
            <Select
              autoFocus
              aria-label={t('chain.addApprover')}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onChange([...chain, e.target.value]);
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
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={available.length === 0}>
              <UserPlus /> {t('chain.addApprover')}
            </Button>
            {touched && (
              <>
                <Button size="sm" variant="ghost" onClick={() => { onChange([]); setLineId(''); onLineChange?.(null); }}>
                  {t('chain.reset')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSavingName('')}>
                  <Save /> {t('chain.saveAsMine')}
                </Button>
              </>
            )}
          </div>
        )}

        {savingName !== null && (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder={t('chain.myLineName')}
              aria-label={t('chain.myLineName')}
              className="h-8 flex-1"
            />
            <Button size="sm" variant="primary" onClick={saveAsMine} disabled={!savingName.trim()}>
              {t('action.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSavingName(null)}>
              {t('action.cancel')}
            </Button>
          </div>
        )}

        {saveState && (
          <p role="status" className="text-[11px] text-text-muted">
            {saveState}
          </p>
        )}

        <p className="border-t border-border-subtle pt-2 text-[11px] leading-relaxed text-text-subtle">
          {t('chain.note')}
        </p>
      </CardBody>
    </Card>
  );
}
