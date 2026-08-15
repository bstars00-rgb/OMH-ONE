import 'server-only';
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { formTemplates } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import type { TemplateField } from '@/lib/validation/templates';

export interface FormTemplate {
  id: string;
  code: string;
  nameEn: string;
  nameKo: string;
  descriptionEn: string | null;
  descriptionKo: string | null;
  officeId: string | null;
  category: string;
  icon: string;
  fields: TemplateField[];
  keywords: string[];
  titlePattern: string;
  amountField: string | null;
  amountCommitsBudget: boolean;
  workflowId: string | null;
  isActive: boolean;
  createdByAi: boolean;
  sortOrder: number;
}

/**
 * Templates this session may file.
 *
 * Office-scoped templates follow the same tenant rule as requests: you see your
 * own office's forms plus the company-wide ones. A Japanese seal application has
 * no meaning in the Vietnam office and should not clutter its picker.
 *
 * Consolidated roles (`activeOfficeId` null) see everything, which is what makes
 * the admin screen usable — an administrator has to be able to edit the Japanese
 * templates without pretending to be Japanese staff.
 */
export async function listTemplates(
  session: SessionUser,
  opts: { includeInactive?: boolean } = {},
): Promise<FormTemplate[]> {
  const db = await ready();

  const clauses: (SQL | undefined)[] = [];
  if (!opts.includeInactive) clauses.push(eq(formTemplates.isActive, true));
  if (session.activeOfficeId) {
    clauses.push(or(isNull(formTemplates.officeId), eq(formTemplates.officeId, session.activeOfficeId)));
  }

  const rows = await db
    .select()
    .from(formTemplates)
    .where(clauses.filter(Boolean).length ? and(...(clauses.filter(Boolean) as SQL[])) : undefined)
    .orderBy(asc(formTemplates.sortOrder), asc(formTemplates.nameEn));

  return rows as FormTemplate[];
}

export async function getTemplate(session: SessionUser, id: string): Promise<FormTemplate | null> {
  const db = await ready();
  const [row] = await db.select().from(formTemplates).where(eq(formTemplates.id, id)).limit(1);
  if (!row) return null;

  // Same office rule as the list, enforced again here — a template id in the URL
  // must not reach a form the session could not otherwise see.
  if (session.activeOfficeId && row.officeId && row.officeId !== session.activeOfficeId) return null;
  return row as FormTemplate;
}

export async function getTemplateByCode(code: string): Promise<FormTemplate | null> {
  const db = await ready();
  const [row] = await db.select().from(formTemplates).where(eq(formTemplates.code, code)).limit(1);
  return (row as FormTemplate) ?? null;
}
