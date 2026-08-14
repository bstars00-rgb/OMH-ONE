'use client';

import * as React from 'react';
import { useT } from '@/lib/i18n/client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  meta?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn('mb-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t('a11y.breadcrumb')} className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 text-text-subtle" aria-hidden="true" />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-text">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
