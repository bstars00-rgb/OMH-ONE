'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Filter, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { REQUEST_TYPES, REQUEST_TYPE_META, REQUEST_STATUSES, STATUS_META, PRIORITIES, RISK_LEVELS } from '@/types/domain';

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
    const t = setTimeout(() => set('q', q), 350);
    return () => clearTimeout(t);
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
          placeholder="Search title, request number or description…"
          aria-label="Search requests"
          className="h-8 max-w-xs flex-1"
        />

        {showType && (
          <Select
            value={params.get('type') ?? ''}
            onChange={(e) => set('type', e.target.value)}
            aria-label="Filter by request type"
            className="h-8 w-auto min-w-32"
          >
            <option value="">All types</option>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {REQUEST_TYPE_META[t].label}
              </option>
            ))}
          </Select>
        )}

        {showStatus && (
          <Select
            value={params.get('status') ?? ''}
            onChange={(e) => set('status', e.target.value)}
            aria-label="Filter by status"
            className="h-8 w-auto min-w-32"
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        )}

        {showRisk && (
          <Select
            value={params.get('risk') ?? ''}
            onChange={(e) => set('risk', e.target.value)}
            aria-label="Filter by AI risk"
            className="h-8 w-auto min-w-28"
          >
            <option value="">Any risk</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0)}
                {r.slice(1).toLowerCase()} risk
              </option>
            ))}
          </Select>
        )}

        <Button size="sm" variant={expanded ? 'primary' : 'secondary'} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <Filter /> More
        </Button>

        {activeCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <X /> Clear {activeCount}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
          {departments && departments.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-text-muted">Department</span>
              <Select value={params.get('departmentId') ?? ''} onChange={(e) => set('departmentId', e.target.value)} className="h-8">
                <option value="">All departments</option>
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
              <span className="mb-1 block text-[11px] font-medium text-text-muted">Requester</span>
              <Select value={params.get('requesterId') ?? ''} onChange={(e) => set('requesterId', e.target.value)} className="h-8">
                <option value="">Anyone</option>
                {requesters.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Priority</span>
            <Select value={params.get('priority') ?? ''} onChange={(e) => set('priority', e.target.value)} className="h-8">
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0)}
                  {p.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Submitted from</span>
            <Input type="date" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} className="h-8" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Submitted to</span>
            <Input type="date" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} className="h-8" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Minimum amount (USD)</span>
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
            <span className="mb-1 block text-[11px] font-medium text-text-muted">Maximum amount (USD)</span>
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
