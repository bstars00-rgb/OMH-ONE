'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { WorkflowError } from '@/lib/workflow/engine';
import {
  addComment,
  cancelRequest,
  decideRequest,
  markStepInReview,
  submitRequest,
} from '@/server/services/approval';
import { getOrCreateReview, invalidateAiReview } from '@/lib/ai/review';
import { getI18n } from '@/lib/i18n/server';
import type { Vars } from '@/lib/i18n/types';

export interface ActionResult {
  ok: boolean;
  /** Already translated: a server action can read the locale cookie, the client cannot re-resolve keys. */
  message: string;
}

/**
 * Resolves a message key into the caller's language.
 *
 * Var values are themselves run through the dictionary when they name a known
 * key, which is how `{status}` and `{action}` in wfError.badStatus come out as
 * "임시저장" and "상신" rather than DRAFT and submitted. Values that are not keys
 * (a workflow step name from the database, a request number) pass through.
 */
async function localize(key: string, vars?: Vars): Promise<string> {
  const { t, tOr } = await getI18n();
  if (!vars) return t(key);
  const resolved: Vars = {};
  for (const [name, value] of Object.entries(vars)) {
    resolved[name] = typeof value === 'string' ? tOr(value, value) : value;
  }
  return t(key, resolved);
}

/** Turns thrown domain errors into a message the UI can show, and nothing else. */
async function toResult(err: unknown): Promise<ActionResult> {
  if (err instanceof PermissionError || err instanceof WorkflowError) {
    return { ok: false, message: await localize(err.message, err.vars) };
  }
  console.error('[action] unexpected failure', err);
  return { ok: false, message: await localize('error.generic') };
}

function refresh(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/approvals');
  revalidatePath('/requests');
  revalidatePath('/');
}

export async function approveRequestAction(requestId: string, comment?: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.approve');
    const result = await decideRequest(session, requestId, 'APPROVE', comment);
    refresh(requestId);
    return { ok: true, message: await localize(result.messageKey, result.messageVars) };
  } catch (err) {
    return await toResult(err);
  }
}

export async function rejectRequestAction(requestId: string, comment: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.approve');
    const result = await decideRequest(session, requestId, 'REJECT', comment);
    refresh(requestId);
    return { ok: true, message: await localize(result.messageKey, result.messageVars) };
  } catch (err) {
    return await toResult(err);
  }
}

export async function returnRequestAction(requestId: string, comment: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.approve');
    const result = await decideRequest(session, requestId, 'RETURN', comment);
    refresh(requestId);
    return { ok: true, message: await localize(result.messageKey, result.messageVars) };
  } catch (err) {
    return await toResult(err);
  }
}

export async function submitRequestAction(requestId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');
    const result = await submitRequest(session, requestId);
    // Regenerate immediately so the request arrives in the approver's inbox with
    // a risk level already attached.
    await invalidateAiReview(requestId);
    await getOrCreateReview(requestId);
    refresh(requestId);
    return { ok: true, message: await localize('decide.submitted', { number: result.requestNumber, count: result.steps }) };
  } catch (err) {
    return await toResult(err);
  }
}

export async function cancelRequestAction(requestId: string, reason?: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const result = await cancelRequest(session, requestId, reason);
    refresh(requestId);
    return { ok: true, message: await localize('decide.withdrawn', { number: result.requestNumber }) };
  } catch (err) {
    return await toResult(err);
  }
}

export async function addCommentAction(requestId: string, body: string, mentions: string[] = []): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await addComment(session, requestId, body, mentions);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, message: await localize('comment.added') };
  } catch (err) {
    return await toResult(err);
  }
}

/** Fired when an approver opens a request they own the current step of. */
export async function markInReviewAction(requestId: string): Promise<void> {
  try {
    const session = await requireSession();
    await markStepInReview(session, requestId);
    revalidatePath(`/requests/${requestId}`);
  } catch (err) {
    console.error('[action] markInReview failed', err);
  }
}
