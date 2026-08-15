'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { Loader2, Search, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card, CardBody, Input, Textarea } from '@/components/ui/primitives';
import { routeRequestAction } from '@/server/actions/route-request';
import { useI18n } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface PickerEntry {
  /** `/requests/new/LEAVE` for a built-in type, `/requests/new/t/<uuid>` for a template. */
  href: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string | null;
  descriptionKo: string | null;
  category: string;
  icon: string;
  /** Office code shown as a chip, e.g. JP. Null for company-wide. */
  officeCode: string | null;
  builtIn: boolean;
}

const CATEGORY_ORDER = ['CORE', 'HR', 'FINANCE', 'TRAVEL', 'DOCUMENT', 'GENERAL'];

/**
 * Picking a form, AI first.
 *
 * The company this replaces browses a list of ~23 templates whose names carry
 * their own filing convention. That list is the problem, not the solution: it
 * grows with every office and every new document, and the user has to know
 * which one they need before they can start.
 *
 * So the sentence box is the primary control and the list is secondary —
 * present, searchable, but not the first thing asked of anyone. Describe what
 * you need and the router picks the form and pre-fills it.
 */
export function FormPicker({ entries }: { entries: PickerEntry[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();

  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [miss, setMiss] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const name = (e: PickerEntry) => (locale === 'ko' ? e.nameKo : e.nameEn);
  const description = (e: PickerEntry) => (locale === 'ko' ? e.descriptionKo : e.descriptionEn);

  async function route() {
    if (text.trim().length < 6 || pending) return;
    setPending(true);
    setMiss(null);
    const res = await routeRequestAction(text);
    setPending(false);

    if (res.ok && res.href) {
      // The sentence rides along so the destination form can draft from it
      // without the user retyping what they already said.
      router.push(`${res.href}?q=${encodeURIComponent(text)}`);
      return;
    }
    setMiss(res.message);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.nameEn} ${e.nameKo} ${e.descriptionEn ?? ''} ${e.descriptionKo ?? ''} ${e.officeCode ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [entries, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, PickerEntry[]>();
    for (const e of filtered) {
      const key = e.builtIn ? 'CORE' : e.category;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    );
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Primary path — say what you need */}
      <Card className="border-accent-border bg-accent-soft/30">
        <CardBody className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Sparkles className="size-4 text-accent" /> {t('pick.askTitle')}
          </p>
          <p className="text-xs leading-relaxed text-text-muted">{t('pick.askBody')}</p>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder={t('pick.askPlaceholder')}
            aria-label={t('pick.askTitle')}
            disabled={pending}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void route();
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={route} disabled={pending || text.trim().length < 6}>
              {pending ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {pending ? t('pick.routing') : t('pick.go')}
            </Button>
            <span className="text-[11px] text-text-subtle">{t('pick.shortcut')}</span>
          </div>

          {miss && (
            <p
              role="status"
              className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
            >
              {miss}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Secondary path — browse, for when you already know */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">{t('pick.browse')}</h2>
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('pick.searchForms')}
              aria-label={t('pick.searchForms')}
              className="h-8 w-56 pl-7"
            />
          </label>
        </div>

        {grouped.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-border-subtle bg-surface px-4 py-8 text-center text-xs text-text-muted">
            {t('pick.noForms', { query })}
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([category, items]) => (
              <section key={category}>
                <p className="mb-2 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">
                  {t(`pick.cat.${category}`)}
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((e) => {
                    const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[e.icon];
                    return (
                      <Link
                        key={e.href}
                        href={e.href}
                        className="group rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3.5 transition-colors hover:border-accent-border hover:bg-accent-soft/30"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                              'bg-surface-sunken text-text-muted group-hover:bg-accent group-hover:text-accent-fg',
                            )}
                          >
                            {Icon ? <Icon className="size-4" /> : <Icons.FileText className="size-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                              <span className="truncate">{name(e)}</span>
                              {e.officeCode && (
                                <span className="shrink-0 rounded border border-border-subtle px-1 font-mono text-[9px] font-normal text-text-subtle">
                                  {e.officeCode}
                                </span>
                              )}
                            </p>
                            {description(e) && (
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                                {description(e)}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
