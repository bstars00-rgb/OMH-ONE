'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlays';
import { Button } from '@/components/ui/primitives';

type Theme = 'light' | 'dark' | 'system';
const KEY = 'ohmy-theme';

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * localStorage is an external store, so it is read through `useSyncExternalStore`
 * rather than copied into state inside an effect. That keeps the first client
 * render consistent with what the pre-paint script already applied, and avoids a
 * cascading re-render on mount.
 */
const themeStore = {
  subscribe(callback: () => void) {
    window.addEventListener('storage', callback);
    window.addEventListener('ohmy-theme-change', callback);
    return () => {
      window.removeEventListener('storage', callback);
      window.removeEventListener('ohmy-theme-change', callback);
    };
  },
  getSnapshot(): Theme {
    return ((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) as Theme) ?? 'system';
  },
  // The server has no preference; the inline head script resolves it before paint.
  getServerSnapshot(): Theme {
    return 'system';
  },
};

export function ThemeToggle() {
  const theme = React.useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);

  // Follow the OS while the preference is "system".
  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function choose(next: Theme) {
    localStorage.setItem(KEY, next);
    apply(next);
    window.dispatchEvent(new Event('ohmy-theme-change'));
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}. Change theme`}>
          <Icon />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => choose('light')}>
          <Sun className="size-4" /> Light {theme === 'light' && <span className="ml-auto text-accent">✓</span>}
        </DropdownItem>
        <DropdownItem onSelect={() => choose('dark')}>
          <Moon className="size-4" /> Dark {theme === 'dark' && <span className="ml-auto text-accent">✓</span>}
        </DropdownItem>
        <DropdownItem onSelect={() => choose('system')}>
          <Monitor className="size-4" /> System {theme === 'system' && <span className="ml-auto text-accent">✓</span>}
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
