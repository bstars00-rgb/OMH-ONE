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
import type { SubmitOptions } from '@/server/services/approval';
import { getI18n } from '@/lib/i18n/server';
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
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');

    const { t, locale } = await getI18n();

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      // Both the banner and each field message are resolved here — the schemas
      // only ever carry keys.
      const keyed = fieldErrors(parsed.error);
      const errors = Object.fromEntries(Object.entries(keyed).map(([field, key]) => [field, t(key)]));
      return { ok: false, message: t('form.fixHighlighted'), errors };
    }

    const created = await create(parsed.data);

    if (submitNow) {
      await submitRequest(session, created.id, submitOptions);
      await getOrCreateReview(created.id, { locale });
    }

    revalidatePath('/requests');
    revalidatePath('/approvals');
    revalidatePath('/');

    return {
      ok: true,
      requestId: created.id,
      message: t(submitNow ? 'form.submitted' : 'form.savedDraft', { number: created.requestNumber }),
    };
  } catch (err) {
    // `redirect()` throws a control-flow signal — never swallow it.
    if (err && typeof err === 'object' && 'digest' in err && String(err.digest).startsWith('NEXT_REDIRECT')) throw err;

    const { t } = await getI18n();
    if (err instanceof PermissionError || err instanceof WorkflowError || err instanceof ValidationError) {
      return { ok: false, message: t(err.message, err.vars) };
    }
    console.error('[create] failed', err);
    return { ok: false, message: t('form.createFailed') };
  }
}

export async function createLeaveAction(
  raw: unknown,
  submitNow: boolean,
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  const session = await requireSession();
  return run(leaveSchema, raw, (input) => createLeave(session, input), submitNow, submitOptions);
}

export async function createTripAction(
  raw: unknown,
  submitNow: boolean,
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  const session = await requireSession();
  return run(tripSchema, raw, (input) => createTrip(session, input), submitNow, submitOptions);
}

export async function createPurchaseAction(
  raw: unknown,
  submitNow: boolean,
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  const session = await requireSession();
  return run(purchaseSchema, raw, (input) => createPurchase(session, input), submitNow, submitOptions);
}

export async function createExpenseAction(
  raw: unknown,
  submitNow: boolean,
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  const session = await requireSession();
  return run(expenseSchema, raw, (input) => createExpense(session, input), submitNow, submitOptions);
}

export async function createGenericAction(
  type: 'HR' | 'GENERAL',
  raw: unknown,
  submitNow: boolean,
  submitOptions: SubmitOptions = {},
): Promise<CreateResult> {
  const session = await requireSession();
  return run(genericSchema, raw, (input) => createGeneric(session, type, input), submitNow, submitOptions);
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

    const { t } = await getI18n();

    const text = prompt.trim();
    if (text.length < 10) return { ok: false, message: t('draft.tooShort') };
    if (text.length > 1500) return { ok: false, message: t('draft.tooLong') };

    const ctx = await buildFormContext(session);
    const draft = await getAIProvider().generateForm(text, type, ctx);

    return {
      ok: true,
      message: t('draft.ready'),
      fields: draft.fields,
      // Keys, resolved here. A note may carry one argument after a pipe.
      missing: draft.missing?.map((key) => t(key)),
      notes: draft.notes?.map((note) => {
        const [key, arg] = note.split('|');
        return arg ? t(key, { names: arg }) : t(key);
      }),
      confidence: draft.confidence,
    };
  } catch (err) {
    console.error('[ai] draft failed', err);
    return { ok: false, message: (await getI18n()).t('draft.failed') };
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
    return { ok: false as const, message: (await getI18n()).t('expForm.receiptFailed') };
  }
}
