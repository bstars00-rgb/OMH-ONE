import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { offices } from '@/lib/db/schema';
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
  const [templates, officeRows] = await Promise.all([
    // Retired templates are included: an administrator has to be able to see and
    // restore what they turned off.
    listTemplates(session, { includeInactive: true }),
    db.select({ id: offices.id, code: offices.code, name: offices.name }).from(offices).orderBy(asc(offices.code)),
  ]);

  return (
    <>
      <PageHeader title={t('tplGen.pageTitle')} description={t('tplGen.pageSubtitle')} />
      <TemplateStudio templates={templates as TemplateRow[]} offices={officeRows} />
    </>
  );
}
