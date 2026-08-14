import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { systemSettings } from '@/lib/db/schema';
import { aiProviderName, isLiveModel } from '@/lib/ai';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { Badge, Card, CardHeader, CardBody, DetailRow } from '@/components/ui/primitives';
import { getI18n, getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('set.title') };
}

export default async function SettingsPage() {
  const session = await requireSession();
  const { t } = await getI18n();
  if (!can(session, 'admin.settings')) return <ForbiddenPage what={t('set.title')} />;

  const db = await ready();
  const rows = await db.select().from(systemSettings).orderBy(asc(systemSettings.key));

  const driver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite')).toLowerCase();

  return (
    <>
      <PageHeader title={t('set.title')} description={t('set.subtitle')} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <SettingsPanel settings={rows} />

        <Card className="h-fit">
          <CardHeader title={t('set.runtime')} description={t('set.runtimeSub')} />
          <CardBody>
            <dl className="divide-y divide-border-subtle">
              <DetailRow label={t('set.dbDriver')}>
                <Badge tone={driver === 'postgres' ? 'emerald' : 'slate'}>
                  {driver === 'postgres' ? 'PostgreSQL' : t('set.dbEmbedded')}
                </Badge>
              </DetailRow>
              <DetailRow label={t('set.aiProvider')}>
                <Badge tone={isLiveModel() ? 'emerald' : 'slate'}>{aiProviderName()}</Badge>
              </DetailRow>
              <DetailRow label={t('set.aiMode')}>{t(isLiveModel() ? 'set.aiModeLive' : 'set.aiModeMock')}</DetailRow>
              <DetailRow label={t('set.environment')}>{process.env.NODE_ENV}</DetailRow>
              <DetailRow label={t('set.autoSeed')}>
                {t(process.env.AUTO_SEED === 'false' ? 'state.disabled' : 'state.enabled')}
              </DetailRow>
            </dl>

            <p className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] leading-relaxed text-text-subtle">
              {t(driver === 'pglite' ? 'set.dbNotePglite' : 'set.dbNotePostgres')}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-text-subtle">
              {t(isLiveModel() ? 'set.aiNoteLive' : 'set.aiNoteMock')}
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
