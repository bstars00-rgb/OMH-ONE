import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { offices } from '@/lib/db/schema';
import { listOrgApprovalLines } from '@/server/queries/approval-lines';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { LineManager } from '@/components/admin/line-manager';
import { REQUEST_TYPES } from '@/types/domain';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('line.title') };
}

export default async function ApprovalLinesPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.workflow')) return <ForbiddenPage what={t('line.title')} />;

  const db = await ready();
  const [lines, officeRows] = await Promise.all([
    listOrgApprovalLines(),
    db.select({ id: offices.id, code: offices.code, name: offices.name }).from(offices).orderBy(asc(offices.code)),
  ]);

  return (
    <>
      <PageHeader title={t('line.title')} description={t('line.subtitle')} />
      <LineManager lines={lines} offices={officeRows} requestTypes={[...REQUEST_TYPES]} />
    </>
  );
}
