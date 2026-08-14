import type { Metadata } from 'next';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { REQUEST_TYPES, REQUEST_TYPE_META, type RequestType } from '@/types/domain';

export const metadata: Metadata = { title: 'New request' };

const BLURB: Record<RequestType, string> = {
  LEAVE: 'Annual, sick or unpaid leave. Working days, public holidays and your balance are calculated for you.',
  BUSINESS_TRIP: 'Domestic or international travel with a cost breakdown. Compared against previous trips to the same city.',
  PURCHASE: 'Buy goods or services. Checked against price history, vendor records and the department budget.',
  EXPENSE: 'Claim money back. Receipts are structured automatically and checked for duplicates.',
  HR: 'Certificates, contract changes, training, equipment and other people requests.',
  GENERAL: 'Anything that needs a decision but does not fit the other types.',
};

export default async function NewRequestPage() {
  const session = await requireSession();
  if (!can(session, 'request.create')) return <ForbiddenPage what="creating requests" />;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My Requests', href: '/requests' }, { label: 'New request' }]}
        title="What do you need?"
        description="Pick a type. Each form asks for the minimum — the system works out the routing, the policy checks and the budget impact."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REQUEST_TYPES.map((type) => {
          const meta = REQUEST_TYPE_META[type];
          const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[meta.icon];
          return (
            <Link
              key={type}
              href={`/requests/new/${type}`}
              className="group rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 transition-colors hover:border-accent-border hover:bg-accent-soft/30"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted transition-colors group-hover:bg-accent group-hover:text-accent-fg">
                  {Icon && <Icon className="size-4.5" />}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    {meta.label}
                    <span className="font-mono text-[10px] font-normal text-text-subtle">{meta.prefix}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{BLURB[type]}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-text-subtle">
        <Icons.Sparkles className="size-3.5" />
        Every form has a “Draft with AI” box — describe the request in a sentence and it fills the fields for you to check.
      </p>
    </>
  );
}
