import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CircleAlert, Info, Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { MorningBrief } from '@/lib/ai/types';

const SEVERITY = {
  CRITICAL: { icon: CircleAlert, className: 'text-rose-500' },
  WARNING: { icon: AlertTriangle, className: 'text-amber-500' },
  INFO: { icon: Info, className: 'text-sky-500' },
};

export function MorningBriefCard({ brief, liveModel }: { brief: MorningBrief; liveModel: boolean }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-accent-border bg-accent-soft/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-accent uppercase">
            <Sparkles className="size-3.5" /> AI brief
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text">{brief.greeting}</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {brief.pendingCount > 0
              ? `${brief.pendingCount} request${brief.pendingCount === 1 ? '' : 's'} waiting for your review.`
              : 'Nothing is waiting for your review.'}
          </p>
        </div>
        <div className="flex gap-2">
          {brief.pendingCount > 0 && (
            <Link href="/approvals" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Review approvals <ArrowRight />
            </Link>
          )}
          <Link href="/assistant" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Sparkles /> Ask AI
          </Link>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {brief.lines.map((line) => {
          const meta = SEVERITY[line.severity];
          const Icon = meta.icon;
          const content = (
            <>
              <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-text">
                  {line.title}
                  <span className="sr-only"> — {line.severity.toLowerCase()}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{line.detail}</span>
              </span>
              {line.href && <ArrowRight className="mt-0.5 ml-auto size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />}
            </>
          );

          return (
            <li key={line.id}>
              {line.href ? (
                <Link
                  href={line.href}
                  className="flex gap-2.5 rounded-[var(--radius-control)] border border-transparent px-2 py-1.5 transition-colors hover:border-border-subtle hover:bg-surface"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex gap-2.5 px-2 py-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-t border-accent-border/60 pt-2.5 text-[10px] text-text-subtle">
        Generated from your visible data by the {liveModel ? 'configured model' : 'built-in rules engine'}. Findings are
        computed from live records — nothing here is an estimate.
      </p>
    </section>
  );
}
