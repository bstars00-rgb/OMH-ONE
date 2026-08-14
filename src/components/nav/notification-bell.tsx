'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, CheckCheck, CircleAlert, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Button } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { markAllNotificationsRead, markNotificationRead } from '@/server/actions/notifications';
import { relativeTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { NotificationRow } from '@/server/queries/notifications';

const SEVERITY_ICON = {
  CRITICAL: <CircleAlert className="size-4 text-rose-500" />,
  WARNING: <AlertTriangle className="size-4 text-amber-500" />,
  INFO: <Info className="size-4 text-blue-500" />,
};

export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationRow[];
  unread: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function open(n: NotificationRow) {
    startTransition(async () => {
      if (!n.isRead) await markNotificationRead(n.id);
      if (n.requestId) router.push(`/requests/${n.requestId}`);
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <p className="text-sm font-semibold text-text">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(() => markAllNotificationsRead())}
            >
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-5" />}
              title="Nothing new"
              description="Approval requests and status changes will appear here."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    disabled={pending}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover',
                      !n.isRead && 'bg-accent-soft/40',
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {SEVERITY_ICON[n.severity as keyof typeof SEVERITY_ICON] ?? SEVERITY_ICON.INFO}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-[13px]', n.isRead ? 'text-text-muted' : 'font-medium text-text')}>
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-text-subtle">{relativeTime(n.createdAt)}</span>
                      </span>
                      {n.body && <span className="mt-0.5 block truncate text-[11px] text-text-muted">{n.body}</span>}
                    </span>
                    {!n.isRead && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border-subtle px-4 py-2">
          <Link href="/approvals" className="text-xs font-medium text-accent hover:underline">
            Go to approval inbox →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
