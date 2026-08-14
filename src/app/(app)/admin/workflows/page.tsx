import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalWorkflowSteps, approvalWorkflows, departments, employees } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { WorkflowEditor, type ApproverOption, type WorkflowDto } from '@/components/admin/workflow-editor';
import { REQUEST_TYPES } from '@/types/domain';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('wf.title') };
}

export default async function WorkflowsPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.workflow')) return <ForbiddenPage what={t('wf.title')} />;

  const db = await ready();
  const [workflows, people] = await Promise.all([
    db
      .select()
      .from(approvalWorkflows)
      .where(eq(approvalWorkflows.isActive, true))
      .orderBy(asc(approvalWorkflows.requestType)),
    // Candidates for a named-approver step. Active staff only — routing a request
    // to someone who has left would strand it.
    db
      .select({
        id: employees.id,
        name: employees.name,
        position: employees.position,
        departmentCode: departments.code,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(eq(employees.status, 'ACTIVE'))
      .orderBy(asc(employees.name)) as Promise<ApproverOption[]>,
  ]);

  const withSteps: WorkflowDto[] = await Promise.all(
    workflows.map(async (w) => {
      const steps = await db
        .select()
        .from(approvalWorkflowSteps)
        .where(eq(approvalWorkflowSteps.workflowId, w.id))
        .orderBy(asc(approvalWorkflowSteps.stepOrder));
      return {
        id: w.id,
        name: w.name,
        requestType: w.requestType,
        description: w.description,
        steps: steps.map((s) => ({
          name: s.name,
          approverRole: s.approverRole,
          approverEmployeeId: s.approverEmployeeId,
          slaHours: s.slaHours,
          conditionType: s.conditionType,
          conditionValue: s.conditionValue,
        })),
      };
    }),
  );

  // Keep the cards in the same order as the request-type picker.
  const ordered = REQUEST_TYPES.map((t) => withSteps.find((w) => w.requestType === t)).filter(Boolean) as WorkflowDto[];

  return (
    <>
      <PageHeader
        title={t('wf.title')}
        description={t('wf.subtitle')}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {ordered.map((w) => (
          <WorkflowEditor key={w.id} workflow={w} people={people} />
        ))}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">{t('wf.howTitle')}</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-muted">
          <li>{t('wf.how1')}</li>
          <li>
            {t('wf.how2')}{' '}
            <a href="/admin/organization" className="text-accent hover:underline">
              {t('org.title')} →
            </a>
          </li>
          <li>{t('wf.how3')}</li>
          <li>{t('wf.how4')}</li>
          <li>{t('wf.how5')}</li>
        </ul>
      </div>
    </>
  );
}
