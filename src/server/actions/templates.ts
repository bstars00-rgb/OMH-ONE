'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { WorkflowError } from '@/lib/workflow/engine';
import { ValidationError, createFromTemplate } from '@/server/services/create-request';
import { submitRequest } from '@/server/services/approval';
import { getTemplate } from '@/server/queries/templates';
import { getOrCreateReview, invalidateAiReview } from '@/lib/ai/review';
import { validateValues } from '@/lib/validation/templates';
import { getI18n } from '@/lib/i18n/server';
import type { CreateResult } from './create';

/**
 * Files a request from a form template.
 *
 * Mirrors the typed create actions exactly — same result shape, same key-based
 * messages, same "save as draft or submit now" choice — so the form renderer
 * does not care whether it is showing a template or a built-in type.
 */
export async function createTemplateRequestAction(
  templateId: string,
  raw: Record<string, unknown>,
  submitNow: boolean,
  extraApproverIds: string[] = [],
): Promise<CreateResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');
    const { t, locale } = await getI18n();

    // Re-fetched rather than trusted from the client: the id arrives in a POST
    // body, and the office rule inside getTemplate is what stops one office
    // filing another's form.
    const template = await getTemplate(session, templateId);
    if (!template) return { ok: false, message: t('tpl.notFound') };

    const checked = validateValues(template.fields, raw);
    if (!checked.ok) {
      const errors = Object.fromEntries(Object.entries(checked.errors).map(([field, key]) => [field, t(key)]));
      return { ok: false, message: t('form.fixHighlighted'), errors };
    }

    const created = await createFromTemplate(
      session,
      {
        id: template.id,
        titlePattern: template.titlePattern,
        name: locale === 'ko' ? template.nameKo : template.nameEn,
        amountField: template.amountField,
        amountCommitsBudget: template.amountCommitsBudget,
        workflowId: template.workflowId,
      },
      checked.values,
    );

    if (submitNow) {
      await submitRequest(session, created.id, extraApproverIds);
      await invalidateAiReview(created.id);
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
    if (err && typeof err === 'object' && 'digest' in err && String(err.digest).startsWith('NEXT_REDIRECT')) throw err;

    const { t } = await getI18n();
    if (err instanceof PermissionError || err instanceof WorkflowError || err instanceof ValidationError) {
      return { ok: false, message: t(err.message, err.vars) };
    }
    console.error('[template] create failed', err);
    return { ok: false, message: t('form.createFailed') };
  }
}
