import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Inbox, Lock, SearchX, ServerCrash, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './primitives';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-text-subtle">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoResults({ onReset }: { onReset?: React.ReactNode }) {
  return (
    <EmptyState
      icon={<SearchX className="size-5" />}
      title="No matching results"
      description="No records match the current filters. Try widening the date range or clearing a filter."
      action={onReset}
    />
  );
}

/** Typed error surfaces — each names the cause and the way out. */
export function ErrorState({
  kind = 'generic',
  message,
  action,
  className,
}: {
  kind?: 'generic' | 'permission' | 'notFound' | 'ai' | 'network';
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const config = {
    generic: {
      icon: <ServerCrash className="size-5" />,
      title: 'Something went wrong',
      description: 'The request could not be completed. Try again, and if it persists contact your administrator.',
    },
    permission: {
      icon: <Lock className="size-5" />,
      title: 'You do not have access to this',
      description: 'Your role does not include permission to view this record. Ask an administrator if you need it.',
    },
    notFound: {
      icon: <SearchX className="size-5" />,
      title: 'Not found',
      description: 'This record does not exist, or it has been removed.',
    },
    ai: {
      icon: <WifiOff className="size-5" />,
      title: 'AI is temporarily unavailable',
      description: 'Analysis could not be generated. Approvals and all other functions are unaffected.',
    },
    network: {
      icon: <AlertTriangle className="size-5" />,
      title: 'Connection problem',
      description: 'The server could not be reached. Check your connection and try again.',
    },
  }[kind];

  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
        {config.icon}
      </div>
      <p className="text-sm font-medium text-text">{config.title}</p>
      <p className="mt-1 max-w-sm text-xs text-text-muted">{message ?? config.description}</p>
      <div className="mt-4">
        {action ?? (
          <Link href="/" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Back to home
          </Link>
        )}
      </div>
    </div>
  );
}

/** Full-page 403, used by server pages when a capability check fails. */
export function ForbiddenPage({ what }: { what?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <ErrorState
        kind="permission"
        message={
          what
            ? `Your role does not include access to ${what}. If you need it, ask an administrator to update your role.`
            : undefined
        }
      />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3 animate-pulse rounded bg-surface-sunken"
              style={{ width: c === 0 ? '18%' : c === cols - 1 ? '8%' : `${10 + ((r + c) % 3) * 4}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5', className)}
      aria-busy="true"
    >
      <div className="h-3 w-24 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-3 h-7 w-32 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}
