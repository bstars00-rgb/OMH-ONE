'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { canViewRequest } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalSteps, requests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAIProvider } from '@/lib/ai';
import { buildRequestContext } from '@/lib/ai/context';
import { getOrCreateReview, recordReviewFeedback } from '@/lib/ai/review';

export interface CopilotResult {
  ok: boolean;
  answer: string;
  evidence: string[];
  message: string;
}

/**
 * Re-authorizes before assembling context. The copilot's answer draws on
 * cross-employee data (peer trip costs, team leave), so the check here is the
 * thing standing between a curious employee and another department's numbers.
 */
async function assertCanSee(requestId: string) {
  const session = await requireSession();
  const db = await ready();
  const [row] = await db
    .select({
      requesterId: requests.requesterId,
      departmentId: requests.departmentId,
      requestType: requests.requestType,
    })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!row) return null;

  const approvers = await db
    .select({ id: approvalSteps.approverId })
    .from(approvalSteps)
    .where(eq(approvalSteps.requestId, requestId));

  const ok = canViewRequest(session, row, approvers.map((a) => a.id).filter(Boolean) as string[]);
  return ok ? session : null;
}

export async function askCopilotAction(requestId: string, question: string): Promise<CopilotResult> {
  const fail = (message: string): CopilotResult => ({ ok: false, answer: '', evidence: [], message });

  if (!question.trim()) return fail('Enter a question.');
  if (question.length > 500) return fail('Question is too long.');

  try {
    const session = await assertCanSee(requestId);
    if (!session) return fail('You do not have access to this request.');

    const ctx = await buildRequestContext(requestId);
    if (!ctx) return fail('Request not found.');

    const answer = await getAIProvider().answerRequestQuestion(question, ctx);
    return { ok: true, answer: answer.answer, evidence: answer.evidence, message: '' };
  } catch (err) {
    console.error('[ai] copilot failed', err);
    return fail('AI is temporarily unavailable. Approvals and all other functions are unaffected.');
  }
}

export async function reviewFeedbackAction(requestId: string, helpful: boolean) {
  try {
    const session = await assertCanSee(requestId);
    if (!session) return;
    await recordReviewFeedback(requestId, helpful);
  } catch (err) {
    console.error('[ai] feedback failed', err);
  }
}

/** Force-regenerates the cached review, e.g. after the request was edited. */
export async function regenerateReviewAction(requestId: string) {
  try {
    const session = await assertCanSee(requestId);
    if (!session) return { ok: false, message: 'You do not have access to this request.' };
    await getOrCreateReview(requestId, { force: true });
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, message: 'Analysis refreshed.' };
  } catch (err) {
    console.error('[ai] regenerate failed', err);
    return { ok: false, message: 'Could not refresh the analysis.' };
  }
}
