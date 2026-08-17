'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { deleteApprovalLine, saveApprovalLine } from '@/server/services/approval-lines';
import { getT } from '@/lib/i18n/server';

export interface LineResult {
  ok: boolean;
  /** Already translated — only the server can read the locale cookie. */
  message: string;
}

/**
 * These are thin on purpose: resolve the session, delegate, translate.
 *
 * Everything worth testing lives in server/services/approval-lines.ts, which
 * takes a session as an argument and returns message keys. That is the seam the
 * QA suite drives — a server action cannot be called outside a request scope,
 * so logic that lives inside one cannot be tested at all.
 */
async function run(fn: () => Promise<{ ok: boolean; key: string; vars?: Record<string, string | number> }>): Promise<LineResult> {
  const t = await getT();
  try {
    const out = await fn();
    if (out.ok) {
      revalidatePath('/admin/approval-lines');
      revalidatePath('/requests/new');
    }
    return { ok: out.ok, message: t(out.key, out.vars) };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, message: t(err.message, err.vars) };
    console.error('[approval-lines] action failed', err);
    return { ok: false, message: t('set.saveFailed') };
  }
}

/** Publishes a line for a whole office. Administrative. */
export async function saveOrgLineAction(raw: unknown): Promise<LineResult> {
  return run(async () => {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');
    return saveApprovalLine(session, 'organization', raw);
  });
}

export async function deleteOrgLineAction(lineId: string): Promise<LineResult> {
  return run(async () => {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');
    return deleteApprovalLine(session, lineId);
  });
}

/**
 * Saves the current chain as one of the requester's own lines.
 *
 * Personal, not organizational: someone who files the same expense every month
 * should be able to keep their route without an administrator publishing it for
 * the whole company. Re-saving the same name overwrites, because "save" here
 * means "this is my line for this", not "keep a version history".
 */
export async function saveMyLineAction(name: string, approverIds: string[], requestType?: string): Promise<LineResult> {
  return run(async () => {
    const session = await requireSession();
    assertCan(session, 'request.create');
    return saveApprovalLine(session, 'personal', {
      name,
      approverIds,
      requestType: requestType ?? null,
    });
  });
}

export async function deleteMyLineAction(lineId: string): Promise<LineResult> {
  return run(async () => {
    const session = await requireSession();
    return deleteApprovalLine(session, lineId);
  });
}
