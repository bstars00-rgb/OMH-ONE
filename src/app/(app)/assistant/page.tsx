import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { scopeLabelKey } from '@/lib/rbac';
import { isLiveModel } from '@/lib/ai';
import { PageHeader } from '@/components/page-header';
import { AssistantChat } from '@/components/assistant-chat';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('nav.assistant') };
}

export default async function AssistantPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  const scope = scopeLabelKey(session);
  const scopeLabel = t(scope.key, scope.vars);

  return (
    <>
      <PageHeader
        title={t('assist.title')}
        description={t('assist.subtitle', { scope: scopeLabel })}
      />
      <AssistantChat liveModel={isLiveModel()} scope={scopeLabel} />
    </>
  );
}
