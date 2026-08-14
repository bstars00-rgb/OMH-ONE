'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { WorkflowError } from '@/lib/workflow/engine';
import {
  expenseSchema,
  fieldErrors,
  genericSchema,
  leaveSchema,
  purchaseSchema,
  tripSchema,
} from '@/lib/validation/requests';
import {
  ValidationError,
  createExpense,
  createGeneric,
  createLeave,
  createPurchase,
  createTrip,
} from '@/server/services/create-request';
import { submitRequest } from '@/server/services/approval';
import { getOrCreateReview } from '@/lib/ai/review';
import { getAIProvider } from '@/lib/ai';
import { buildFormContext } from '@/server/queries/form-context';
import type { RequestType } from '@/types/domain';

export interface CreateResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  requestId?: string;
}

/**
 * Every create action re-validates on the server and re-checks the capability.
 * The client schema is a convenience for the user; this is the one that counts,
 * because a server function can be POSTed to directly.
 */
async function run<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  create: (input: T) => Promise<{ id: string; requestNumber: string }>,
  submitNow: boolean,
): Promise<CreateResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: 'Please correct the highlighted fields.', errors: fieldErrors(parsed.error) };
    }

    const created = await create(parsed.data);

    if (submitNow) {
      await submitRequest(session, created.id);
      await getOrCreateReview(created.id);
    }

    revalidatePath('/requests');
    revalidatePath('/approvals');
    revalidatePath('/');

    return {
      ok: true,
      requestId: created.id,
      message: submitNow
        ? `${created.requestNumber} submitted for approval.`
        : `${created.requestNumber} saved as a draft.`,
    };
  } catch (err) {
    if (err instanceof PermissionError || err instanceof WorkflowError || err instanceof ValidationError) {
      return { ok: false, message: err.message };
    }
    // `redirect()` throws a control-flow signal — never swallow it.
    if (err && typeof err === 'object' && 'digest' in err && String(err.digest).startsWith('NEXT_REDIRECT')) throw err;
    console.error('[create] failed', err);
    return { ok: false, message: 'The request could not be created. Please try again.' };
  }
}

export async function createLeaveAction(raw: unknown, submitNow: boolean): Promise<CreateResult> {
  const session = await requireSession();
  return run(leaveSchema, raw, (input) => createLeave(session, input), submitNow);
}

export async function createTripAction(raw: unknown, submitNow: boolean): Promise<CreateResult> {
  const session = await requireSession();
  return run(tripSchema, raw, (input) => createTrip(session, input), submitNow);
}

export async function createPurchaseAction(raw: unknown, submitNow: boolean): Promise<CreateResult> {
  const session = await requireSession();
  return run(purchaseSchema, raw, (input) => createPurchase(session, input), submitNow);
}

export async function createExpenseAction(raw: unknown, submitNow: boolean): Promise<CreateResult> {
  const session = await requireSession();
  return run(expenseSchema, raw, (input) => createExpense(session, input), submitNow);
}

export async function createGenericAction(
  type: 'HR' | 'GENERAL',
  raw: unknown,
  submitNow: boolean,
): Promise<CreateResult> {
  const session = await requireSession();
  return run(genericSchema, raw, (input) => createGeneric(session, type, input), submitNow);
}

export async function goToRequest(requestId: string): Promise<void> {
  redirect(`/requests/${requestId}`);
}

/* ------------------------------------------------------------------ */
/* AI form generation                                                  */
/* ------------------------------------------------------------------ */

export interface DraftResult {
  ok: boolean;
  message: string;
  fields?: Record<string, unknown>;
  missing?: string[];
  notes?: string[];
  confidence?: number;
}

/**
 * Turns one sentence into a structured draft the user then reviews.
 *
 * The draft is never submitted automatically — it fills the form, and the person
 * checks it. Anything the extractor could not determine comes back in `missing`
 * rather than being invented.
 */
export async function draftFromTextAction(type: RequestType, prompt: string): Promise<DraftResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');

    const text = prompt.trim();
    if (text.length < 10) return { ok: false, message: 'Describe the request in a sentence or two.' };
    if (text.length > 1500) return { ok: false, message: 'That is too long — summarize it in a couple of sentences.' };

    const ctx = await buildFormContext(session);
    const draft = await getAIProvider().generateForm(text, type, ctx);

    return {
      ok: true,
      message: 'Draft ready — check every field before submitting.',
      fields: draft.fields,
      missing: draft.missing,
      notes: draft.notes,
      confidence: draft.confidence,
    };
  } catch (err) {
    console.error('[ai] draft failed', err);
    return { ok: false, message: 'Could not generate a draft. Fill the form manually — nothing else is affected.' };
  }
}

/** Receipt structuring for the expense form. */
export async function extractReceiptAction(fileName: string, hintText?: string) {
  try {
    await requireSession();
    const line = await getAIProvider().extractExpense({ fileName, hintText });
    return { ok: true as const, line };
  } catch (err) {
    console.error('[ai] receipt extraction failed', err);
    return { ok: false as const, message: 'Could not read that receipt. Enter the details manually.' };
  }
}
