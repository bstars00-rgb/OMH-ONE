'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, Globe2, Loader2 } from 'lucide-react';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays';
import { setActiveOfficeAction } from '@/server/actions/office';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export interface OfficeOption {
  id: string;
  code: string;
  name: string;
  country: string;
}

/**
 * Tenant switcher.
 *
 * Only rendered for roles with consolidated visibility. Ordinary staff see a
 * static badge of their own office instead — there is nothing to switch to, and
 * showing a disabled control would imply otherwise.
 */
export function OfficeSwitcher({
  offices,
  activeOfficeId,
  canSwitch,
  ownOfficeCode,
}: {
  offices: OfficeOption[];
  activeOfficeId: string | null;
  canSwitch: boolean;
  ownOfficeCode: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = React.useState(false);

  if (!canSwitch) {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2 py-1 text-[11px] font-medium text-text-muted sm:inline-flex"
        title={t('office.ownOnly')}
      >
        <Building2 className="size-3.5" />
        {ownOfficeCode ?? '—'}
      </span>
    );
  }

  const active = offices.find((o) => o.id === activeOfficeId);

  async function choose(id: string) {
    setPending(true);
    await setActiveOfficeAction(id);
    setPending(false);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={t('office.switch')}
          className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle bg-surface px-2 py-1 text-[11px] font-medium text-text transition-colors hover:bg-surface-hover"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : active ? (
            <Building2 className="size-3.5 text-text-subtle" />
          ) : (
            <Globe2 className="size-3.5 text-accent" />
          )}
          <span className="max-w-24 truncate">{active ? active.code : t('office.all')}</span>
        </button>
      </DropdownTrigger>

      <DropdownContent align="end" className="min-w-56">
        <DropdownLabel>{t('office.viewing')}</DropdownLabel>

        <DropdownItem onSelect={() => choose('all')}>
          <Globe2 className="size-4" />
          <span className="flex-1">{t('office.allConsolidated')}</span>
          {!activeOfficeId && <Check className="size-3.5 text-accent" />}
        </DropdownItem>

        <DropdownSeparator />

        {offices.map((o) => (
          <DropdownItem key={o.id} onSelect={() => choose(o.id)}>
            <Building2 className="size-4" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{o.name}</span>
              <span className="block truncate text-[10px] text-text-subtle">{o.country}</span>
            </span>
            {activeOfficeId === o.id && <Check className="size-3.5 shrink-0 text-accent" />}
          </DropdownItem>
        ))}

        <DropdownSeparator />
        <p className={cn('px-2 py-1.5 text-[10px] leading-relaxed text-text-subtle')}>{t('office.consolidatedNote')}</p>
      </DropdownContent>
    </DropdownMenu>
  );
}
