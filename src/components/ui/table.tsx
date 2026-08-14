import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './primitives';

/**
 * Dense enterprise table. Rows are 40px so ~18 fit on a 1080p screen.
 * The wrapper owns the horizontal scroll so the page body never scrolls sideways.
 */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-max border-collapse text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-sunken">{children}</thead>;
}

export function TH({
  children,
  className,
  align = 'left',
  sort,
  href,
  scope = 'col',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Present makes the header a sort control and sets aria-sort. */
  sort?: 'asc' | 'desc' | 'none';
  href?: string;
  scope?: 'col' | 'row';
}) {
  const ariaSort = sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : sort === 'none' ? 'none' : undefined;
  return (
    <th
      scope={scope}
      aria-sort={ariaSort}
      className={cn(
        'border-b border-border-subtle px-3 py-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 hover:text-text">
          {children}
          {sort === 'asc' && <span aria-hidden="true">↑</span>}
          {sort === 'desc' && <span aria-hidden="true">↓</span>}
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border-subtle">{children}</tbody>;
}

export function TR({
  children,
  className,
  interactive,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <tr className={cn(interactive && 'transition-colors hover:bg-surface-hover', className)}>{children}</tr>
  );
}

export function TD({
  children,
  className,
  align = 'left',
  numeric,
  colSpan,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  colSpan?: number;
  /** Native tooltip — useful when the cell truncates. */
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        'px-3 py-2.5 text-[13px] text-text',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Whole-row link. An anchor cannot wrap <tr>, so the first cell carries a
 * stretched overlay link — one tab stop per row, and the row is still clickable
 * anywhere. Interactive controls in later cells sit above it via `relative`.
 */
export function RowLink({ href, label, children }: { href: string; label: string; children?: React.ReactNode }) {
  return (
    <>
      <Link href={href} className="absolute inset-0 z-0" aria-label={label}>
        <span className="sr-only">{label}</span>
      </Link>
      {children}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination — URL-driven, so a page survives reload and can be shared */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageSize,
  total,
  makeHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const disabled = 'pointer-events-none opacity-40';

  return (
    <nav
      className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5"
      aria-label="Pagination"
    >
      <p className="text-xs text-text-muted tabular">
        <span className="font-medium text-text">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-text">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          href={makeHref(page - 1)}
          aria-label="Previous page"
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
          aria-label="Next page"
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
