'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui/primitives';
import { TR, TD } from '@/components/ui/table';
import { saveSettingAction, type AdminResult } from '@/server/actions/admin';
import { useI18n } from '@/lib/i18n/client';

export interface SettingDto {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: Date;
}

export function SettingRow({ setting, onResult }: { setting: SettingDto; onResult: (r: AdminResult) => void }) {
  const router = useRouter();
  const { t, tOr } = useI18n();
  const initial = typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value);
  const [value, setValue] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  const isBoolean = typeof setting.value === 'boolean';
  const isNumber = typeof setting.value === 'number';
  const dirty = value !== initial;

  async function save() {
    setPending(true);
    const res = await saveSettingAction(setting.key, value);
    setPending(false);
    onResult(res);
    if (res.ok) router.refresh();
  }

  return (
    <TR>
      <TD>
        <code className="font-mono text-xs font-medium">{setting.key}</code>
      </TD>
      <TD className="max-w-80 text-text-muted">{tOr(`setting.${setting.key}`, setting.description ?? '—')}</TD>
      <TD>
        {isBoolean ? (
          <Select value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-28" aria-label={setting.key}>
            <option value="true">{t('state.enabled')}</option>
            <option value="false">{t('state.disabled')}</option>
          </Select>
        ) : (
          <Input
            type={isNumber ? 'number' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 w-56"
            aria-label={setting.key}
          />
        )}
      </TD>
      <TD align="right">
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {t('action.save')}
        </Button>
      </TD>
    </TR>
  );
}
