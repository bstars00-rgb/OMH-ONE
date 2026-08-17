'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { PermissionError } from '@/lib/rbac';
import { getT } from '@/lib/i18n/server';
import type { SessionUser } from '@/lib/auth/session';
import {
  deleteCostCenter,
  deleteDepartment,
  deleteOffice,
  deleteTeam,
  saveCostCenter,
  saveDepartment,
  saveOffice,
  saveTeam,
  type OrgOutcome,
} from '@/server/services/organization';

export interface OrgResult {
  ok: boolean;
  /** Already translated — only the server can read the locale cookie. */
  message: string;
}

/**
 * Resolve the session, delegate, translate.
 *
 * Everything worth testing lives in server/services/organization.ts. A server
 * action cannot be called outside a request scope, so logic that stays in one
 * cannot be exercised by a test — which is why these are as thin as they are.
 */
async function run(fn: (session: SessionUser) => Promise<OrgOutcome>): Promise<OrgResult> {
  const t = await getT();
  try {
    const session = await requireSession();
    const out = await fn(session);
    if (out.ok) revalidatePath('/admin/organization');
    // A var may itself be a message key — the blocker's noun, for instance — so
    // it is resolved before the sentence is built.
    const vars = out.vars
      ? Object.fromEntries(Object.entries(out.vars).map(([k, v]) => [k, typeof v === 'string' ? t(v) : v]))
      : undefined;
    return { ok: out.ok, message: t(out.key, vars) };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, message: t(err.message, err.vars) };
    console.error('[organization] action failed', err);
    return { ok: false, message: t('org.saveFailed') };
  }
}

export async function saveOfficeAction(raw: unknown): Promise<OrgResult> {
  return run((s) => saveOffice(s, raw));
}
export async function deleteOfficeAction(id: string): Promise<OrgResult> {
  return run((s) => deleteOffice(s, id));
}
export async function saveDepartmentAction(raw: unknown): Promise<OrgResult> {
  return run((s) => saveDepartment(s, raw));
}
export async function deleteDepartmentAction(id: string): Promise<OrgResult> {
  return run((s) => deleteDepartment(s, id));
}
export async function saveTeamAction(raw: unknown): Promise<OrgResult> {
  return run((s) => saveTeam(s, raw));
}
export async function deleteTeamAction(id: string): Promise<OrgResult> {
  return run((s) => deleteTeam(s, id));
}
export async function saveCostCenterAction(raw: unknown): Promise<OrgResult> {
  return run((s) => saveCostCenter(s, raw));
}
export async function deleteCostCenterAction(id: string): Promise<OrgResult> {
  return run((s) => deleteCostCenter(s, id));
}
