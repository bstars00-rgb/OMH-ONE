import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { scopeLabel } from '@/lib/rbac';
import { isLiveModel } from '@/lib/ai';
import { PageHeader } from '@/components/page-header';
import { AssistantChat } from '@/components/assistant-chat';

export const metadata: Metadata = { title: 'AI Assistant' };

export default async function AssistantPage() {
  const session = await requireSession();

  return (
    <>
      <PageHeader
        title="Ask OHMY AI"
        description={`Ask questions about company data in plain language. Answers are limited to ${scopeLabel(session).toLowerCase()}.`}
      />
      <AssistantChat liveModel={isLiveModel()} scope={scopeLabel(session)} />
    </>
  );
}
