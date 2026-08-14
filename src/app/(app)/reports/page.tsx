import type { Metadata } from 'next';
import { Download, FileSpreadsheet } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { can, scopeLabelKey, type Capability } from '@/lib/rbac';
import { REPORTS } from '@/server/queries/reports';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { Card, buttonVariants } from '@/components/ui/primitives';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('report.title') };
}

export default async function ReportsPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'reports.export')) return <ForbiddenPage what={t('report.title')} />;

  const available = REPORTS.map((r) => ({ ...r, allowed: can(session, r.capability as Capability) }));
  const scope = scopeLabelKey(session);

  return (
    <>
      <PageHeader
        title={t('report.title')}
        description={t('report.subtitle', { scope: t(scope.key, scope.vars) })}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {available.map((r) => (
          <Card key={r.key} className="flex flex-col p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
                <FileSpreadsheet className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                {/* Report definitions live in server code; the dictionary owns their wording. */}
                <p className="text-sm font-semibold text-text">{t(`report.${r.key}`)}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(`report.${r.key}.desc`)}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              {r.allowed ? (
                <a
                  href={`/api/reports/${r.key}`}
                  download
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <Download /> {t('report.downloadCsv')}
                </a>
              ) : (
                <span className="text-[11px] text-text-subtle">{t('report.notAllowed')}</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-text-subtle">
        {t('report.footnote')}
      </p>
    </>
  );
}
