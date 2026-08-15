'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { formTemplates, offices } from '@/lib/db/schema';
import { recordAudit } from '@/server/audit';
import { draftTemplate, type TemplateDraft } from '@/lib/ai/template-generator';
import { templateSchema } from '@/lib/validation/templates';
import { getT } from '@/lib/i18n/server';
import type { Vars } from '@/lib/i18n/types';

export interface AdminResult {
  ok: boolean;
  message: string;
}

async function say(ok: boolean, key: string, vars?: Vars): Promise<AdminResult> {
  const t = await getT();
  return { ok, message: t(key, vars) };
}

async function fail(err: unknown): Promise<AdminResult> {
  if (err instanceof PermissionError) return say(false, err.message, err.vars);
  console.error('[template-admin] failed', err);
  return say(false, 'set.saveFailed');
}

export interface GenerateResult {
  ok: boolean;
  message: string;
  draft?: TemplateDraft & { officeId: string | null; notes: string[] };
}

/**
 * Drafts a template from a description or a pasted form.
 *
 * Returns a draft for review rather than writing anything: an administrator
 * publishing a form they have not read is how a broken form reaches every
 * employee at once.
 */
export async function generateTemplateAction(input: string): Promise<GenerateResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');
    const t = await getT();

    const text = input.trim();
    if (text.length < 10) return { ok: false, message: t('tplGen.tooShort') };
    if (text.length > 8000) return { ok: false, message: t('tplGen.tooLong') };

    const draft = draftTemplate(text);

    // Resolve the inferred office code to a real id, so the reviewer sees the
    // office already selected rather than having to work out which one.
    let officeId: string | null = null;
    if (draft.officeCode) {
      const db = await ready();
      const [office] = await db.select({ id: offices.id }).from(offices).where(eq(offices.code, draft.officeCode)).limit(1);
      officeId = office?.id ?? null;
    }

    return {
      ok: true,
      message: t('tplGen.ready', { count: draft.fields.length }),
      draft: { ...draft, officeId, notes: draft.notes },
    };
  } catch (err) {
    const t = await getT();
    console.error('[template-admin] generate failed', err);
    return { ok: false, message: t('tplGen.failed') };
  }
}

/** Creates or updates a template. `id` absent means create. */
export async function saveTemplateAction(raw: unknown, id?: string): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');

    const parsed = templateSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return say(false, issue?.message?.startsWith('tpl.') ? issue.message : 'tpl.checkForm');
    }
    const input = parsed.data;

    const db = await ready();
    const values = {
      code: input.code,
      nameEn: input.nameEn,
      nameKo: input.nameKo,
      descriptionEn: input.descriptionEn ?? null,
      descriptionKo: input.descriptionKo ?? null,
      officeId: input.officeId ?? null,
      category: input.category,
      icon: input.icon,
      fields: input.fields,
      titlePattern: input.titlePattern,
      amountField: input.amountField ?? null,
      amountCommitsBudget: input.amountCommitsBudget,
      workflowId: input.workflowId ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    };

    if (id) {
      const [existing] = await db.select().from(formTemplates).where(eq(formTemplates.id, id)).limit(1);
      if (!existing) return say(false, 'tpl.notFound');
      await db.update(formTemplates).set(values).where(eq(formTemplates.id, id));
    } else {
      const [clash] = await db.select().from(formTemplates).where(eq(formTemplates.code, input.code)).limit(1);
      if (clash) return say(false, 'tpl.codeTaken', { code: input.code });
      await db.insert(formTemplates).values({ ...values, createdByAi: true });
    }

    await recordAudit(db, {
      action: id ? 'SETTING_CHANGE' : 'CREATE',
      entityType: 'form_template',
      entityId: input.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${input.nameEn} ${id ? 'updated' : 'created'} (${input.fields.length} fields)`,
      metadata: { code: input.code, category: input.category, fields: input.fields.map((f) => f.key) },
    });

    revalidatePath('/admin/templates');
    revalidatePath('/requests/new');
    return say(true, id ? 'tpl.updated' : 'tpl.created', { name: input.nameEn });
  } catch (err) {
    return await fail(err);
  }
}

export async function setTemplateActiveAction(id: string, isActive: boolean): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');

    const db = await ready();
    const [existing] = await db.select().from(formTemplates).where(eq(formTemplates.id, id)).limit(1);
    if (!existing) return say(false, 'tpl.notFound');

    await db.update(formTemplates).set({ isActive, updatedAt: new Date() }).where(eq(formTemplates.id, id));
    await recordAudit(db, {
      action: 'SETTING_CHANGE',
      entityType: 'form_template',
      entityId: existing.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${existing.nameEn} ${isActive ? 'activated' : 'retired'}`,
    });

    revalidatePath('/admin/templates');
    revalidatePath('/requests/new');
    // Retiring hides a form from the picker; requests already filed on it keep
    // rendering, because the detail view reads the template row directly.
    return say(true, isActive ? 'tpl.activated' : 'tpl.retired', { name: existing.nameEn });
  } catch (err) {
    return await fail(err);
  }
}
