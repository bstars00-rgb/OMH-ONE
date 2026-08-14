'use client';

import * as React from 'react';
import { Card } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody } from '@/components/ui/table';
import { UserRow, type UserDto } from './user-row';
import type { AdminResult } from '@/server/actions/admin';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function UserTable({ users }: { users: UserDto[] }) {
  const t = useT();
  const [result, setResult] = React.useState<AdminResult | null>(null);
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.roles.join(' ')} ${u.departmentCode ?? ''}`.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <>
      {result && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'mb-3 rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium',
            result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
          )}
        >
          {result.message}
        </p>
      )}

      <label className="mb-3 block">
        <span className="sr-only">{t('users.searchAria')}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('users.searchPlaceholder')}
          className="h-8 w-full max-w-sm rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
        />
      </label>

      <Card className="overflow-hidden">
        <TableWrap>
          <THead>
            <TH>{t('users.user')}</TH>
            <TH>{t('label.departmentShort')}</TH>
            <TH>{t('users.rolesCol')}</TH>
            <TH>{t('label.status')}</TH>
            <TH align="right">{t('label.actions')}</TH>
          </THead>
          <TBody>
            {filtered.map((u) => (
              <UserRow key={u.userId} user={u} onResult={setResult} />
            ))}
          </TBody>
        </TableWrap>
      </Card>

      <p className="mt-3 text-[11px] text-text-subtle">
        {t('users.showing', { shown: filtered.length, total: users.length })} {t('users.roleNote')}
      </p>
    </>
  );
}
