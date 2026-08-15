import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { getTemplate } from '@/server/queries/templates';
import { getTripFormData } from '@/server/queries/form-context';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { TemplateForm } from '@/components/requests/new/template-form';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const { locale } = await getI18n();
  const template = await getTemplate(session, id);
  const t = await getT();
  if (!template) return { title: t('new.breadcrumb') };
  return { title: locale === 'ko' ? template.nameKo : template.nameEn };
}

/**
 * Renders a template-driven form.
 *
 * Lives under `/requests/new/t/[id]` rather than `/requests/new/[type]` so the
 * two paths cannot collide: a template id is a uuid, a type is an enum member,
 * and mixing them in one dynamic segment would make a malformed type silently
 * become a template lookup.
 */
export default async function NewTemplateRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { t, locale } = await getI18n();

  if (!can(session, 'request.create')) return <ForbiddenPage what={t('new.creatingRequests')} />;

  const template = await getTemplate(session, id);
  if (!template) notFound();

  // Reused from the trip form: the same colleague list backs every `employee` field.
  const { colleagues } = await getTripFormData(session);
  const label = locale === 'ko' ? template.nameKo : template.nameEn;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('nav.requests'), href: '/requests' },
          { label: t('new.breadcrumb'), href: '/requests/new' },
          { label },
        ]}
        title={label}
        description={(locale === 'ko' ? template.descriptionKo : template.descriptionEn) ?? undefined}
      />
      <TemplateForm
        template={{
          id: template.id,
          code: template.code,
          nameEn: template.nameEn,
          nameKo: template.nameKo,
          descriptionEn: template.descriptionEn,
          descriptionKo: template.descriptionKo,
          category: template.category,
          fields: template.fields,
          titlePattern: template.titlePattern,
          amountField: template.amountField,
        }}
        colleagues={colleagues.map((c) => ({ id: c.id, name: c.name }))}
      />
    </>
  );
}
