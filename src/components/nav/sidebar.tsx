'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
// usePathname is used by SidebarNav for the active state.
import { cn } from '@/lib/utils';
import { isActive, type NavSection } from '@/lib/nav';
import { Button } from '@/components/ui/primitives';
import { useT } from '@/lib/i18n/client';
import { BRAND } from '@/lib/brand';

function NavIcon({ name }: { name: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />;
}

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t('nav.main')}>
      {sections.map((section) => (
        <div key={section.labelKey}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">
            {t(section.labelKey)}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-accent-soft text-accent'
                        : 'text-text-muted hover:bg-surface-hover hover:text-text',
                    )}
                  >
                    <NavIcon name={item.icon} />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mobile navigation. Below `lg` the sidebar is a sheet behind a menu button. */
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = React.useState(false);
  const t = useT();

  // Closing on navigation is handled by SidebarNav's onNavigate callback rather
  // than by watching the pathname — the click already knows it is navigating.

  // Lock scroll while the panel is open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label={t('nav.openMenu')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icons.Menu />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('nav.closeMenu')}
            className="absolute inset-0 bg-zinc-950/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <span className="flex size-6 items-center justify-center rounded bg-accent text-xs font-bold text-accent-fg">
                  {BRAND.mark}
                </span>
                {BRAND.name}
              </span>
              <Button variant="ghost" size="iconSm" aria-label={t('nav.closeMenu')} onClick={() => setOpen(false)}>
                <Icons.X />
              </Button>
            </div>
            <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
