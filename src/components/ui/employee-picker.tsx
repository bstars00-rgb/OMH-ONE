'use client';

import * as React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Avatar, Input } from '@/components/ui/primitives';
import { searchPeopleAction, type PersonHit } from '@/server/actions/people-search';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface PickedPerson {
  id: string;
  name: string;
  position?: string | null;
}

/**
 * Search-and-pick for a person.
 *
 * Replaces the dropdowns these fields used to be. A dropdown has to be built
 * from a list decided in advance, and every such list here was "the requester's
 * own department" — which fails precisely when someone needs it, handing over
 * to another team or adding an approver outside their reporting line.
 *
 * Nothing is preselected. An empty field means nobody is assigned, which is the
 * honest state for an optional handover; a name appears only because a person
 * chose it.
 */
export function EmployeePicker({
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
  disabled,
}: {
  value: PickedPerson | null;
  onChange: (person: PickedPerson | null) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [hits, setHits] = React.useState<PersonHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Close on an outside click, so the list does not sit over the form.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Debounced, and an empty query still searches: opening the field should show
  // people rather than an empty box waiting to be typed into.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      const res = await searchPeopleAction(query);
      if (cancelled) return;
      setHits(res);
      setCursor(0);
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  function pick(hit: PersonHit) {
    onChange({ id: hit.id, name: hit.name, position: hit.position });
    setOpen(false);
    setQuery('');
  }

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-border-strong bg-surface px-2.5">
        <Avatar name={value.name} size="xs" />
        <span className="min-w-0 flex-1 truncate text-sm text-text">
          {value.name}
          {value.position && <span className="ml-1.5 text-[11px] text-text-subtle">{value.position}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label={t('picker.clear', { name: value.name })}
          className="shrink-0 rounded p-0.5 text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle">
        {loading && open ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
      </span>
      <Input
        id={id}
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && hits[cursor]) {
            e.preventDefault();
            pick(hits[cursor]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder ?? t('picker.placeholder')}
        aria-label={ariaLabel ?? t('picker.placeholder')}
        autoComplete="off"
        className="pl-7"
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised p-1 shadow-popover">
          {hits.length === 0 && !loading ? (
            <p className="px-2 py-3 text-center text-xs text-text-muted">{t('picker.noMatch', { query })}</p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={hit.id}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(hit)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                  cursor === i ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                <Avatar name={hit.name} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text">{hit.name}</span>
                  <span className="block truncate text-[10px] text-text-subtle">
                    {[hit.position, hit.departmentName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {hit.officeCode && (
                  <span className="shrink-0 rounded border border-border-subtle px-1 font-mono text-[9px] text-text-subtle">
                    {hit.officeCode}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
