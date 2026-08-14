'use client';

import * as React from 'react';
import { Card, CardHeader } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody } from '@/components/ui/table';
import { SettingRow, type SettingDto } from './settings-form';
import type { AdminResult } from '@/server/actions/admin';
import { cn } from '@/lib/utils';

export function SettingsPanel({ settings }: { settings: SettingDto[] }) {
  const [result, setResult] = React.useState<AdminResult | null>(null);

  return (
    <div>
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

      <Card className="overflow-hidden">
        <CardHeader title="Application settings" description="Stored in the database and read live by the app." />
        <TableWrap>
          <THead>
            <TH>Key</TH>
            <TH>Description</TH>
            <TH>Value</TH>
            <TH align="right">Action</TH>
          </THead>
          <TBody>
            {settings.map((s) => (
              <SettingRow key={s.key} setting={s} onResult={setResult} />
            ))}
          </TBody>
        </TableWrap>
      </Card>
    </div>
  );
}
