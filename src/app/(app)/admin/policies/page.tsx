import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { policies } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { PolicyEditor, type PolicyDto } from '@/components/admin/policy-editor';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('pol.title') };
}

export default async function PoliciesPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.policy')) return <ForbiddenPage what={t('pol.title')} />;

  const db = await ready();
  const rows = await db.select().from(policies).orderBy(asc(policies.appliesTo), asc(policies.code));

  return (
    <>
      <PageHeader
        title={t('pol.title')}
        description={t('pol.subtitle')}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((p) => (
          <PolicyEditor key={p.id} policy={p as PolicyDto} />
        ))}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">{t('pol.howTitle')}</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-muted">
          <li>{t('pol.how1')}</li>
          <li>{t('pol.how2')}</li>
          <li>{t('pol.how3')}</li>
          <li>{t('pol.how4')}</li>
        </ul>
      </div>
    </>
  );
}
