import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { policies } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { PolicyEditor, type PolicyDto } from '@/components/admin/policy-editor';

export const metadata: Metadata = { title: 'Policies' };

export default async function PoliciesPage() {
  const session = await requireSession();
  if (!can(session, 'admin.policy')) return <ForbiddenPage what="the policy engine" />;

  const db = await ready();
  const rows = await db.select().from(policies).orderBy(asc(policies.appliesTo), asc(policies.code));

  return (
    <>
      <PageHeader
        title="Policies"
        description="Company rules checked automatically against every request before an approver reads it."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((p) => (
          <PolicyEditor key={p.id} policy={p as PolicyDto} />
        ))}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">How policies are enforced</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-muted">
          <li>
            Each policy is evaluated against the request&apos;s own figures — hotel rate against the cap, meal total per
            day against the allowance, purchase value against the quotation threshold, leave length against the
            consecutive-days limit, request value against the remaining department budget.
          </li>
          <li>
            The result appears in the AI review panel as a pass, warning or failure, each with the actual number and the
            threshold, so the approver can see exactly how far over it is.
          </li>
          <li>
            A failing <strong className="text-text">blocking</strong> policy changes the Approve button into
            &ldquo;Approve with override&rdquo;, which requires a written reason recorded in the audit log.
          </li>
          <li>Deactivating a policy stops it being evaluated on new analyses; existing cached reviews keep their result until refreshed.</li>
        </ul>
      </div>
    </>
  );
}
