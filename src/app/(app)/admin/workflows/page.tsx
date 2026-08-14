import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalWorkflowSteps, approvalWorkflows } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { WorkflowEditor, type WorkflowDto } from '@/components/admin/workflow-editor';
import { REQUEST_TYPES } from '@/types/domain';

export const metadata: Metadata = { title: 'Workflow Builder' };

export default async function WorkflowsPage() {
  const session = await requireSession();
  if (!can(session, 'admin.workflow')) return <ForbiddenPage what="the workflow builder" />;

  const db = await ready();
  const workflows = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.isActive, true))
    .orderBy(asc(approvalWorkflows.requestType));

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
        title="Workflow Builder"
        description="Define who approves what, in which order, and under which conditions. No developer needed."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {ordered.map((w) => (
          <WorkflowEditor key={w.id} workflow={w} />
        ))}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">How routing is resolved</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-muted">
          <li>
            <strong className="text-text">Manager</strong> resolves to the requester&apos;s line manager;{' '}
            <strong className="text-text">Department Head</strong> to the head of their department, escalating to that
            person&apos;s manager if they are the requester.
          </li>
          <li>
            <strong className="text-text">HR</strong>, <strong className="text-text">Finance</strong> and{' '}
            <strong className="text-text">Director</strong> resolve to the head of the HR, Finance and CEO departments
            respectively — set in <a href="/admin/organization" className="text-accent hover:underline">Organization</a>.
          </li>
          <li>A step whose condition does not hold is skipped. A step that resolves to the requester is skipped, so self-approval is structurally impossible.</li>
          <li>Consecutive steps resolving to the same person are collapsed into one decision.</li>
          <li>If every step collapses away, a single Director step is kept — nothing can reach Approved without a human.</li>
        </ul>
      </div>
    </>
  );
}
