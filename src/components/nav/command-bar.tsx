'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CornerDownLeft,
  FileText,
  Loader2,
  Plane,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { SearchHit } from '@/server/queries/search';

interface QuickAction {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Match terms in both languages, so typing "출장" and typing "trip" both find
   * the same action. The label is matched separately, in whichever language the
   * user is viewing.
   */
  keywords: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { labelKey: 'command.newTrip', href: '/requests/new/BUSINESS_TRIP', icon: Plane, keywords: 'trip travel create new 출장 신청' },
  { labelKey: 'command.newPurchase', href: '/requests/new/PURCHASE', icon: ShoppingCart, keywords: 'pr purchase buy create new 구매 요청 발주' },
  { labelKey: 'command.newExpense', href: '/requests/new/EXPENSE', icon: Receipt, keywords: 'expense claim receipt create new 경비 정산 영수증' },
  { labelKey: 'command.newLeave', href: '/requests/new/LEAVE', icon: CalendarDays, keywords: 'leave holiday vacation create new 연차 휴가 신청' },
  { labelKey: 'command.askAi', href: '/assistant', icon: Sparkles, keywords: 'ai ask question assistant 질문 어시스턴트' },
  { labelKey: 'command.openDashboard', href: '/', icon: LayoutDashboard, keywords: 'home dashboard overview 대시보드 홈' },
  { labelKey: 'command.approvalInbox', href: '/approvals', icon: FileText, keywords: 'approvals inbox pending 결재함 결재 대기' },
  { labelKey: 'command.directory', href: '/people', icon: Users, keywords: 'people employees directory staff 임직원 조회 직원' },
];

/**
 * Cmd/Ctrl+K palette. Combines static quick actions with live database search;
 * both are keyboard-navigable from the same list.
 */
export function CommandBar() {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset happens in the open/close handler rather than an effect watching `open`,
  // so opening the palette is a single render instead of a cascade.
  const openBar = React.useCallback(() => {
    setQuery('');
    setHits([]);
    setCursor(0);
    setLoading(false);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) return false;
          setQuery('');
          setHits([]);
          setCursor(0);
          requestAnimationFrame(() => inputRef.current?.focus());
          return true;
        });
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Debounced server search. State is only written from the timer and fetch
   * callbacks — never synchronously in the effect body — and the "too short"
   * case is handled by deriving the visible list below rather than by clearing
   * state, which would re-render for no reason on every keystroke.
   */
  const tooShort = query.trim().length < 2;
  React.useEffect(() => {
    if (tooShort) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as { hits: SearchHit[] };
          setHits(data.hits ?? []);
          setCursor(0);
        }
      } catch {
        /* aborted or offline — the quick actions still work */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, tooShort]);

  const visibleHits = tooShort ? [] : hits;

  const actions = React.useMemo(
    () => QUICK_ACTIONS.map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );

  const filteredActions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q));
  }, [actions, query]);

  const flat: { href: string; label: string }[] = [
    ...filteredActions.map((a) => ({ href: a.href, label: a.label })),
    ...visibleHits.map((h) => ({ href: h.href, label: h.title })),
  ];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flat[cursor];
      if (target) go(target.href);
    }
  }

  const grouped = visibleHits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.group] ??= []).push(h);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={openBar}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface px-3 text-left text-text-subtle transition-colors hover:border-border-strong"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-[13px]">{t('header.searchPlaceholder')}</span>
        <kbd className="hidden shrink-0 rounded border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-sans text-[10px] font-medium text-text-subtle sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" role="dialog" aria-modal="true" aria-label={t('header.commandBar')}>
          <button
            type="button"
            aria-label={t('action.close')}
            className="absolute inset-0 bg-zinc-950/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised shadow-modal">
            <div className="flex items-center gap-2.5 border-b border-border-subtle px-4">
              {loading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-text-subtle" />
              ) : (
                <Search className="size-4 shrink-0 text-text-subtle" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={t('header.commandPlaceholder')}
                aria-label={t('header.commandLabel')}
                className="h-12 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
              />
              <kbd className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-sans text-[10px] text-text-subtle">
                esc
              </kbd>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filteredActions.length > 0 && (
                <Group label={t('header.actions')}>
                  {filteredActions.map((a, i) => (
                    <Row key={a.href} active={cursor === i} onSelect={() => go(a.href)}>
                      <a.icon className="size-4 shrink-0 text-text-subtle" />
                      <span className="flex-1 truncate">{a.label}</span>
                    </Row>
                  ))}
                </Group>
              )}

              {Object.entries(grouped).map(([group, items]) => (
                <Group key={group} label={t(`header.group.${group}`)}>
                  {items.map((h) => {
                    const idx = flat.findIndex((f) => f.href === h.href && f.label === h.title);
                    return (
                      <Row key={`${group}-${h.id}`} active={cursor === idx} onSelect={() => go(h.href)}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{h.title}</span>
                          <span className="block truncate text-[11px] text-text-subtle">{h.subtitle}</span>
                        </span>
                        {h.meta && <span className="shrink-0 text-[10px] text-text-subtle">{h.meta}</span>}
                      </Row>
                    );
                  })}
                </Group>
              ))}

              {!tooShort && !loading && visibleHits.length === 0 && filteredActions.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-text-muted">
                  {t('header.noSearchResults', { query })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 text-[11px] text-text-subtle">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" /> {t('header.toOpen')}
              </span>
              <span>{t('header.toNavigate')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function Row({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] text-text transition-colors',
        active ? 'bg-accent-soft text-accent' : 'hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  );
}
