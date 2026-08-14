import type { Metadata } from 'next';
import { Download, FileSpreadsheet } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabel, type Capability } from '@/lib/rbac';
import { REPORTS } from '@/server/queries/reports';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { Card, buttonVariants } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const session = await requireSession();
  if (!can(session, 'reports.export')) return <ForbiddenPage what="reports" />;

  const available = REPORTS.map((r) => ({ ...r, allowed: can(session, r.capability as Capability) }));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Preset exports of live data, limited to ${scopeLabel(session).toLowerCase()}. Every export is recorded in the audit log.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {available.map((r) => (
          <Card key={r.key} className="flex flex-col p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
                <FileSpreadsheet className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">{r.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{r.description}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              {r.allowed ? (
                <a
                  href={`/api/reports/${r.key}`}
                  download
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <Download /> Download CSV
                </a>
              ) : (
                <span className="text-[11px] text-text-subtle">Your role does not include this report.</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-text-subtle">
        Files are UTF-8 CSV with a byte-order mark so Excel opens them with the correct encoding on Windows. Rows are
        generated from the database at the moment you click — there is no cached extract. Each report applies the same
        row-level permissions as the rest of the app, so two people downloading the same report may receive different
        numbers of rows.
      </p>
    </>
  );
}
