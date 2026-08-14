'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './primitives';
import { useT } from '@/lib/i18n/client';

/**
 * URL-driven pagination, so a page survives reload and can be shared.
 * Client-side only so it can translate its own labels.
 */
export function Pagination({
  page,
  pageSize,
  total,
  baseParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Current query string minus `page`; serializable, unlike a href builder. */
  baseParams?: string;
}) {
  const t = useT();
  const makeHref = (p: number) => {
    const next = new URLSearchParams(baseParams ?? '');
    next.set('page', String(p));
    return `?${next.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const disabled = 'pointer-events-none opacity-40';

  return (
    <nav className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5" aria-label={t('table.pagination')}>
      <p className="text-xs text-text-muted tabular">
        {t('table.showingOf', { from, to, total: total.toLocaleString() })}
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          href={makeHref(page - 1)}
          aria-label={t('table.previousPage')}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(buttonVariants({ variant: 'secondary', size: 'iconSm' }), page <= 1 && disabled)}
        >
          <ChevronLeft />
        </Link>
        <span className="px-1 text-xs text-text-muted tabular">
          {page} / {pages}
        </span>
        <Link
          href={makeHref(page + 1)}
          aria-label={t('table.nextPage')}
          aria-disabled={page >= pages}
          tabIndex={page >= pages ? -1 : undefined}
          className={cn(buttonVariants({ variant: 'secondary', size: 'iconSm' }), page >= pages && disabled)}
        >
          <ChevronRight />
        </Link>
      </div>
    </nav>
  );
}
