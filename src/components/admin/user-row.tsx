'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Power, X } from 'lucide-react';
import { Avatar, Badge, Button, Checkbox, Select } from '@/components/ui/primitives';
import { TR, TD } from '@/components/ui/table';
import { saveUserRolesAction, setUserActiveAction, type AdminResult } from '@/server/actions/admin';
import { useT } from '@/lib/i18n/client';
import { ROLES } from '@/types/domain';

export interface UserDto {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  position: string | null;
  departmentCode: string | null;
  primaryRole: string;
  roles: string[];
  isActive: boolean;
  lastLoginAt: Date | null;
}

export function UserRow({ user, onResult }: { user: UserDto; onResult: (r: AdminResult) => void }) {
  const router = useRouter();
  const t = useT();
  const [editing, setEditing] = React.useState(false);
  const [primaryRole, setPrimaryRole] = React.useState(user.primaryRole);
  const [roles, setRoles] = React.useState<string[]>(user.roles);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    const res = await saveUserRolesAction({ userId: user.userId, primaryRole, roles });
    setPending(false);
    onResult(res);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function toggleActive() {
    setPending(true);
    const res = await setUserActiveAction(user.userId, !user.isActive);
    setPending(false);
    onResult(res);
    if (res.ok) router.refresh();
  }

  if (editing) {
    return (
      <TR>
        <TD>
          <span className="flex items-center gap-2">
            <Avatar name={user.name} size="xs" />
            <span className="font-medium">{user.name}</span>
          </span>
        </TD>
        <TD colSpan={3}>
          <div className="space-y-2 py-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-[11px]" title={t(`role.${r}.desc`)}>
                  <Checkbox
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))}
                  />
                  {t(`role.${r}`)}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-text-muted">
              {t('users.primaryRole')}
              <Select value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value)} className="h-7 w-40">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </TD>
        <TD align="right">
          <span className="flex justify-end gap-1">
            <Button
              size="iconSm"
              variant="success"
              aria-label={t('users.saveRoles')}
              disabled={pending || roles.length === 0}
              onClick={save}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={t('action.cancel')}
              onClick={() => {
                setEditing(false);
                setRoles(user.roles);
                setPrimaryRole(user.primaryRole);
              }}
            >
              <X />
            </Button>
          </span>
        </TD>
      </TR>
    );
  }

  return (
    <TR interactive>
      <TD>
        <span className="flex items-center gap-2">
          <Avatar name={user.name} size="xs" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="block truncate text-[11px] text-text-subtle">{user.email}</span>
          </span>
        </span>
      </TD>
      <TD className="text-text-muted">{user.departmentCode ?? '—'}</TD>
      <TD>
        <span className="flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <Badge key={r} tone={r === user.primaryRole ? 'indigo' : 'slate'} title={t(`role.${r}.desc`)}>
              {t(`role.${r}`)}
            </Badge>
          ))}
        </span>
      </TD>
      <TD>
        <Badge tone={user.isActive ? 'emerald' : 'rose'}>{t(user.isActive ? 'state.active' : 'state.disabled')}</Badge>
      </TD>
      <TD align="right">
        <span className="flex justify-end gap-1">
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={t('users.editRoles', { name: user.name })}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={t(user.isActive ? 'users.disable' : 'users.enable', { name: user.name })}
            disabled={pending}
            onClick={toggleActive}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Power />}
          </Button>
        </span>
      </TD>
    </TR>
  );
}
