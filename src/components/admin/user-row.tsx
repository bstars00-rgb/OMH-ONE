'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Power, X } from 'lucide-react';
import { Avatar, Badge, Button, Checkbox, Select } from '@/components/ui/primitives';
import { TR, TD } from '@/components/ui/table';
import { saveUserRolesAction, setUserActiveAction, type AdminResult } from '@/server/actions/admin';
import { ROLES, ROLE_META, type Role } from '@/types/domain';

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
                <label key={r} className="flex items-center gap-1.5 text-[11px]" title={ROLE_META[r].description}>
                  <Checkbox
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))}
                  />
                  {ROLE_META[r].label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-text-muted">
              Primary role
              <Select value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value)} className="h-7 w-40">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r as Role]?.label ?? r}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </TD>
        <TD align="right">
          <span className="flex justify-end gap-1">
            <Button size="iconSm" variant="success" aria-label="Save roles" disabled={pending || roles.length === 0} onClick={save}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label="Cancel"
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
            <Badge key={r} tone={r === user.primaryRole ? 'indigo' : 'slate'} title={ROLE_META[r as Role]?.description}>
              {ROLE_META[r as Role]?.label ?? r}
            </Badge>
          ))}
        </span>
      </TD>
      <TD>
        <Badge tone={user.isActive ? 'emerald' : 'rose'}>{user.isActive ? 'Active' : 'Disabled'}</Badge>
      </TD>
      <TD align="right">
        <span className="flex justify-end gap-1">
          <Button size="iconSm" variant="ghost" aria-label={`Edit roles for ${user.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label={user.isActive ? `Disable ${user.name}` : `Enable ${user.name}`}
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
