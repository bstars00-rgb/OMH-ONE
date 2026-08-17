'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { PermissionError } from '@/lib/rbac';
import { getT } from '@/lib/i18n/server';
import type { SessionUser } from '@/lib/auth/session';
import {
  createPolicy,
  deletePolicy,
  savePolicy,
  saveSetting,
  saveUserRoles,
  saveWorkflow,
  setUserActive,
  type AdminOutcome,
} from '@/server/services/admin';

export interface AdminResult {
  ok: boolean;
  /** Already translated — the action can read the locale cookie, the client cannot. */
  message: string;
}

/**
 * Resolve the session, delegate, translate, revalidate.
 *
 * The decisions live in server/services/admin.ts, which takes a session and
 * returns a message key. A server action cannot run outside a request scope, so
 * anything left in here would be untestable by construction.
 */
async function run(path: string, fn: (session: SessionUser) => Promise<AdminOutcome>): Promise<AdminResult> {
  const t = await getT();
  try {
    const session = await requireSession();
    const out = await fn(session);
    if (out.ok) revalidatePath(path);
    return { ok: out.ok, message: t(out.key, out.vars) };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, message: t(err.message, err.vars) };
    console.error('[admin] action failed', err);
    return { ok: false, message: t('set.saveFailed') };
  }
}

export async function saveWorkflowAction(raw: unknown): Promise<AdminResult> {
  return run('/admin/workflows', (s) => saveWorkflow(s, raw));
}

export async function savePolicyAction(raw: unknown): Promise<AdminResult> {
  return run('/admin/policies', (s) => savePolicy(s, raw));
}

export async function createPolicyAction(raw: unknown): Promise<AdminResult> {
  return run('/admin/policies', (s) => createPolicy(s, raw));
}

export async function deletePolicyAction(policyId: string): Promise<AdminResult> {
  return run('/admin/policies', (s) => deletePolicy(s, policyId));
}

export async function saveUserRolesAction(raw: unknown): Promise<AdminResult> {
  return run('/admin/users', (s) => saveUserRoles(s, raw));
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<AdminResult> {
  return run('/admin/users', (s) => setUserActive(s, userId, isActive));
}

export async function saveSettingAction(key: string, value: string): Promise<AdminResult> {
  return run('/admin/settings', (s) => saveSetting(s, key, value));
}
