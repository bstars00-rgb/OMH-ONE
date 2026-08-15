import type { Metadata } from 'next';
import { asc, count, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalWorkflowSteps, approvalWorkflows, offices } from '@/lib/db/schema';
import { listTemplates } from '@/server/queries/templates';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { TemplateStudio, type TemplateRow } from '@/components/admin/template-studio';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('tplGen.pageTitle') };
}

export default async function TemplatesPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.workflow')) return <ForbiddenPage what={t('tplGen.pageTitle')} />;

  const db = await ready();
  const [templates, officeRows, workflowRows, stepCounts] = await Promise.all([
    // Retired templates are included: an administrator has to be able to see and
    // restore what they turned off.
    listTemplates(session, { includeInactive: true }),
    db.select({ id: offices.id, code: offices.code, name: offices.name }).from(offices).orderBy(asc(offices.code)),
    db
      .select({ id: approvalWorkflows.id, name: approvalWorkflows.name, requestType: approvalWorkflows.requestType })
      .from(approvalWorkflows)
      .where(eq(approvalWorkflows.isActive, true))
      .orderBy(asc(approvalWorkflows.requestType)),
    // Counted with a group-by and joined in memory. A correlated subquery read
    // more naturally but returned zero for every row, and a step count that is
    // silently wrong is worse than one that is absent.
    db
      .select({ workflowId: approvalWorkflowSteps.workflowId, n: count() })
      .from(approvalWorkflowSteps)
      .groupBy(approvalWorkflowSteps.workflowId),
  ]);

  const stepsByWorkflow = new Map(stepCounts.map((r) => [r.workflowId, Number(r.n)]));
  const workflows = workflowRows.map((w) => ({ ...w, steps: stepsByWorkflow.get(w.id) ?? 0 }));

  return (
    <>
      <PageHeader title={t('tplGen.pageTitle')} description={t('tplGen.pageSubtitle')} />
      <TemplateStudio templates={templates as TemplateRow[]} offices={officeRows} workflows={workflows} />
    </>
  );
}
