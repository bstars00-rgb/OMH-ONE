'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, FileText, LogOut, User } from 'lucide-react';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays';
import { Avatar } from '@/components/ui/primitives';
import { logoutAction } from '@/server/actions/auth';
import { ROLE_META, type Role } from '@/types/domain';

export function UserMenu({
  name,
  email,
  employeeId,
  roles,
  position,
  scope,
}: {
  name: string;
  email: string;
  employeeId: string;
  roles: Role[];
  position: string | null;
  scope: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[var(--radius-control)] py-1 pr-1.5 pl-1 transition-colors hover:bg-surface-hover"
          aria-label={`Account menu for ${name}`}
        >
          <Avatar name={name} size="sm" />
          <span className="hidden text-left md:block">
            <span className="block max-w-32 truncate text-xs font-medium text-text">{name}</span>
            <span className="block max-w-32 truncate text-[10px] text-text-subtle">{scope}</span>
          </span>
          <ChevronDown className="size-3.5 text-text-subtle" />
        </button>
      </DropdownTrigger>

      <DropdownContent className="min-w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-text">{name}</p>
            <p className="truncate text-[11px] text-text-subtle">{email}</p>
          </div>
        </div>
        {position && <p className="px-2 pb-1 text-[11px] text-text-muted">{position}</p>}

        <DropdownSeparator />
        <DropdownLabel>Roles</DropdownLabel>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {roles.map((r) => (
            <span
              key={r}
              title={ROLE_META[r]?.description}
              className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
            >
              {ROLE_META[r]?.label ?? r}
            </span>
          ))}
        </div>

        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href={`/people/${employeeId}`} className="flex w-full items-center gap-2">
            <User className="size-4" /> My profile
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/requests" className="flex w-full items-center gap-2">
            <FileText className="size-4" /> My requests
          </Link>
        </DropdownItem>

        <DropdownSeparator />
        <DropdownItem danger disabled={pending} onSelect={() => startTransition(() => logoutAction())}>
          <LogOut className="size-4" /> {pending ? 'Signing out…' : 'Sign out'}
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
