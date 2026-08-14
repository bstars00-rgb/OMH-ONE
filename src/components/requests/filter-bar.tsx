'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Filter, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { useT } from '@/lib/i18n/client';
import { REQUEST_TYPES, REQUEST_STATUSES, PRIORITIES, RISK_LEVELS } from '@/types/domain';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Filters live entirely in the URL — a filtered view survives reload, can be
 * bookmarked, and can be pasted to a colleague who will see the same rows
 * (subject to their own permissions).
 */
export function FilterBar({
  departments,
  requesters,
  showType = true,
  showStatus = true,
  showRisk = true,
}: {
  departments?: FilterOption[];
  requesters?: FilterOption[];
  showType?: boolean;
  showStatus?: boolean;
  showRisk?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const [q, setQ] = React.useState(params.get('q') ?? '');

  const set = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page'); // any filter change resets pagination
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounce the free-text box so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const current = params.get('q') ?? '';
    if (q === current) return;
    const timer = setTimeout(() => set('q', q), 350);
    return () => clearTimeout(timer);
  }, [q, params, set]);

  const activeKeys = ['type', 'status', 'risk', 'priority', 'departmentId', 'requesterId', 'from', 'to', 'minAmount', 'maxAmount', 'q'];
  const activeCount = activeKeys.filter((k) => params.get(k)).length;

  function clearAll() {
    setQ('');
    router.push(pathname);
  }

  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('filter.searchRequests')}
          aria-label={t('filter.searchAria')}
          className="h-8 max-w-xs flex-1"
        />

        {showType && (
          <Select
            value={params.get('type') ?? ''}
            onChange={(e) => set('type', e.target.value)}
            aria-label={t('filter.byType')}
            className="h-8 w-auto min-w-32"
          >
            <option value="">{t('label.allTypes')}</option>
            {REQUEST_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`type.${x}`)}
              </option>
            ))}
          </Select>
        )}

        {showStatus && (
          <Select
            value={params.get('status') ?? ''}
            onChange={(e) => set('status', e.target.value)}
            aria-label={t('filter.byStatus')}
            className="h-8 w-auto min-w-32"
          >
            <option value="">{t('label.allStatuses')}</option>
            {REQUEST_STATUSES.map((x) => (
              <option key={x} value={x}>
                {t(`status.${x}`)}
              </option>
            ))}
          </Select>
        )}

        {showRisk && (
          <Select
            value={params.get('risk') ?? ''}
            onChange={(e) => set('risk', e.target.value)}
            aria-label={t('filter.byRisk')}
            className="h-8 w-auto min-w-28"
          >
            <option value="">{t('label.anyRisk')}</option>
            {RISK_LEVELS.map((x) => (
              <option key={x} value={x}>
                {t(`risk.${x}`)}
              </option>
            ))}
          </Select>
        )}

        <Button size="sm" variant={expanded ? 'primary' : 'secondary'} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <Filter /> {t('action.more')}
        </Button>

        {activeCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <X /> {t('filter.clearCount', { count: activeCount })}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
          {departments && departments.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('label.department')}</span>
              <Select value={params.get('departmentId') ?? ''} onChange={(e) => set('departmentId', e.target.value)} className="h-8">
                <option value="">{t('label.allDepartments')}</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {requesters && requesters.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('label.requester')}</span>
              <Select value={params.get('requesterId') ?? ''} onChange={(e) => set('requesterId', e.target.value)} className="h-8">
                <option value="">{t('label.anyone')}</option>
                {requesters.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('label.priority')}</span>
            <Select value={params.get('priority') ?? ''} onChange={(e) => set('priority', e.target.value)} className="h-8">
              <option value="">{t('label.anyPriority')}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('filter.submittedFrom')}</span>
            <Input type="date" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} className="h-8" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('filter.submittedTo')}</span>
            <Input type="date" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} className="h-8" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('filter.minAmount')}</span>
            <Input
              type="number"
              min={0}
              step={100}
              defaultValue={params.get('minAmount') ?? ''}
              onBlur={(e) => set('minAmount', e.target.value)}
              className="h-8"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">{t('filter.maxAmount')}</span>
            <Input
              type="number"
              min={0}
              step={100}
              defaultValue={params.get('maxAmount') ?? ''}
              onBlur={(e) => set('maxAmount', e.target.value)}
              className="h-8"
            />
          </label>
        </div>
      )}
    </div>
  );
}
