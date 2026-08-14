'use server';

import { requireSession } from '@/lib/auth/session';
import { answerQuestion } from '@/lib/ai/query';
import type { ManagementAnswer } from '@/lib/ai/types';

export type ManagementResult = ManagementAnswer;

/**
 * Answers a management question.
 *
 * The session is resolved here and passed into the query layer, which folds the
 * caller's row-level predicate into every statement — so the same question asked
 * by an employee and a director returns different, correctly scoped numbers.
 */
export async function askManagementAction(question: string): Promise<ManagementResult> {
  const session = await requireSession();

  const trimmed = question.trim();
  if (!trimmed) {
    return { intent: 'UNKNOWN', summary: 'Ask a question to get started.', evidence: [], risk: null, action: null };
  }
  if (trimmed.length > 500) {
    return {
      intent: 'UNKNOWN',
      summary: 'That question is too long. Try asking it in one sentence.',
      evidence: [],
      risk: null,
      action: null,
    };
  }

  try {
    return await answerQuestion(session, trimmed);
  } catch (err) {
    console.error('[assistant] query failed', err);
    return {
      intent: 'ERROR',
      summary: 'I could not run that query. Approvals and every other function are unaffected.',
      evidence: [],
      risk: null,
      action: 'Try rephrasing, or open the Analytics page directly.',
      degraded: true,
    };
  }
}
