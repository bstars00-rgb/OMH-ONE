'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Languages, Loader2 } from 'lucide-react';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlays';
import { Button } from '@/components/ui/primitives';
import { setLocaleAction } from '@/server/actions/office';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES, LOCALE_META } from '@/lib/i18n/types';

/**
 * Language switcher.
 *
 * Writes a cookie and refreshes: the locale is resolved server-side, so the new
 * language arrives already rendered rather than being swapped in on the client.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [pending, setPending] = React.useState(false);

  async function choose(next: string) {
    if (next === locale) return;
    setPending(true);
    await setLocaleAction(next);
    setPending(false);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('language.change')}>
          {pending ? <Loader2 className="animate-spin" /> : <Languages />}
        </Button>
      </DropdownTrigger>
      <DropdownContent className="min-w-40">
        {LOCALES.map((l) => (
          <DropdownItem key={l} onSelect={() => choose(l)}>
            <span className="w-6 text-[10px] font-semibold text-text-subtle">{LOCALE_META[l].flag}</span>
            <span className="flex-1">{LOCALE_META[l].nativeLabel}</span>
            {locale === l && <Check className="size-3.5 text-accent" />}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}
