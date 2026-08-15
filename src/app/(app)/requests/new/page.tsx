import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { offices } from '@/lib/db/schema';
import { listTemplates } from '@/server/queries/templates';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { FormPicker, type PickerEntry } from '@/components/requests/new/form-picker';
import { getI18n, getT } from '@/lib/i18n/server';
import { REQUEST_TYPES, REQUEST_TYPE_META } from '@/types/domain';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('new.breadcrumb') };
}

export default async function NewRequestPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'request.create')) return <ForbiddenPage what={t('new.creatingRequests')} />;

  const db = await ready();
  const [templates, officeRows] = await Promise.all([
    listTemplates(session),
    db.select({ id: offices.id, code: offices.code }).from(offices),
  ]);
  const officeCode = new Map(officeRows.map((o) => [o.id, o.code]));

  // The six built-in types and the templates go into one list. To the person
  // filing a request they are the same thing — a form — and the distinction
  // between "has bespoke logic" and "is a template" is ours, not theirs.
  const entries: PickerEntry[] = [
    ...REQUEST_TYPES.map((type) => ({
      href: `/requests/new/${type}`,
      nameEn: t(`type.${type}`),
      nameKo: t(`type.${type}`),
      descriptionEn: t(`new.blurb.${type}`),
      descriptionKo: t(`new.blurb.${type}`),
      category: 'CORE',
      icon: REQUEST_TYPE_META[type].icon,
      officeCode: null,
      builtIn: true,
    })),
    ...templates.map((tpl) => ({
      href: `/requests/new/t/${tpl.id}`,
      nameEn: tpl.nameEn,
      nameKo: tpl.nameKo,
      descriptionEn: tpl.descriptionEn,
      descriptionKo: tpl.descriptionKo,
      category: tpl.category,
      icon: tpl.icon,
      officeCode: tpl.officeId ? (officeCode.get(tpl.officeId) ?? null) : null,
      builtIn: false,
    })),
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: t('nav.requests'), href: '/requests' }, { label: t('new.breadcrumb') }]}
        title={t('new.title')}
        description={t('new.subtitle')}
      />
      <FormPicker entries={entries} />
    </>
  );
}
