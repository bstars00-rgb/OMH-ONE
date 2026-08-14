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

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Turns thrown domain errors into a message the UI can show, and nothing else. */
function toResult(err: unknown): ActionResult {
  if (err instanceof PermissionError || err instanceof WorkflowError) {
    return { ok: false, message: err.message };
  }
  console.error('[action] unexpected failure', err);
  return { ok: false, message: 'Something went wrong. Please try again.' };
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
    return { ok: true, message: result.message };
  } catch (err) {
    return toResult(err);
  }
}

export async function rejectRequestAction(requestId: string, comment: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.approve');
    const result = await decideRequest(session, requestId, 'REJECT', comment);
    refresh(requestId);
    return { ok: true, message: result.message };
  } catch (err) {
    return toResult(err);
  }
}

export async function returnRequestAction(requestId: string, comment: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.approve');
    const result = await decideRequest(session, requestId, 'RETURN', comment);
    refresh(requestId);
    return { ok: true, message: result.message };
  } catch (err) {
    return toResult(err);
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
    return { ok: true, message: `${result.requestNumber} submitted to ${result.steps} approval step(s).` };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelRequestAction(requestId: string, reason?: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const result = await cancelRequest(session, requestId, reason);
    refresh(requestId);
    return { ok: true, message: `${result.requestNumber} has been withdrawn.` };
  } catch (err) {
    return toResult(err);
  }
}

export async function addCommentAction(requestId: string, body: string, mentions: string[] = []): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await addComment(session, requestId, body, mentions);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, message: 'Comment added.' };
  } catch (err) {
    return toResult(err);
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
