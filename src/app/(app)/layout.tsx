import Link from 'next/link';
import { requireLiveSession } from '@/server/auth-guard';
import { can, rolesOf, scopeLabel } from '@/lib/rbac';
import { NAV } from '@/lib/nav';
import { listNotifications, unreadCount } from '@/server/queries/notifications';
import { SidebarNav, MobileNav } from '@/components/nav/sidebar';
import { CommandBar } from '@/components/nav/command-bar';
import { NotificationBell } from '@/components/nav/notification-bell';
import { UserMenu } from '@/components/nav/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { TooltipProvider } from '@/components/ui/overlays';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Validated against the database, not just the cookie signature — a removed
  // account or a revoked role must not keep working from a stale token.
  const session = await requireLiveSession();

  // Nav is filtered by the same capability map the pages enforce.
  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.capability || can(session, i.capability)),
  })).filter((s) => s.items.length > 0);

  const [notifications, unread] = await Promise.all([listNotifications(session), unreadCount(session)]);

  return (
    <TooltipProvider>
      <a href="#main" className="sr-focusable fixed top-2 left-2 z-[100] rounded bg-accent px-3 py-2 text-sm text-accent-fg">
        Skip to content
      </a>

      <div className="flex min-h-dvh bg-canvas">
        {/* Sidebar — fixed on desktop, a sheet below lg */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border-subtle bg-surface lg:flex">
          <Link
            href="/"
            className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3.5 transition-colors hover:bg-surface-hover"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-fg">
              O
            </span>
            <span className="text-[13px] leading-tight font-semibold tracking-tight text-text">
              OHMY AI ERP
              <span className="block text-[10px] font-normal text-text-subtle">Prototype</span>
            </span>
          </Link>
          <SidebarNav sections={sections} />
          <div className="border-t border-border-subtle px-4 py-2.5">
            <p className="text-[10px] leading-relaxed text-text-subtle">
              Demo data. All people and figures are fictional.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface/90 px-3 backdrop-blur sm:px-4">
            <MobileNav sections={sections} />
            <div className="min-w-0 flex-1">
              <CommandBar />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <ThemeToggle />
              <NotificationBell notifications={notifications} unread={unread} />
              <UserMenu
                name={session.name}
                email={session.email}
                employeeId={session.employeeId}
                roles={rolesOf(session)}
                position={session.position}
                scope={scopeLabel(session)}
              />
            </div>
          </header>

          <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
