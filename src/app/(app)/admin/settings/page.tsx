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

export const metadata: Metadata = { title: 'System Settings' };

export default async function SettingsPage() {
  const session = await requireSession();
  if (!can(session, 'admin.settings')) return <ForbiddenPage what="system settings" />;

  const db = await ready();
  const rows = await db.select().from(systemSettings).orderBy(asc(systemSettings.key));

  const driver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite')).toLowerCase();

  return (
    <>
      <PageHeader title="System Settings" description="Application-wide configuration. Every change is recorded in the audit log." />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <SettingsPanel settings={rows} />

        <Card className="h-fit">
          <CardHeader title="Runtime" description="Read from the environment — change these in .env.local" />
          <CardBody>
            <dl className="divide-y divide-border-subtle">
              <DetailRow label="Database driver">
                <Badge tone={driver === 'postgres' ? 'emerald' : 'slate'}>
                  {driver === 'postgres' ? 'PostgreSQL' : 'PGlite (embedded)'}
                </Badge>
              </DetailRow>
              <DetailRow label="AI provider">
                <Badge tone={isLiveModel() ? 'emerald' : 'slate'}>{aiProviderName()}</Badge>
              </DetailRow>
              <DetailRow label="AI mode">
                {isLiveModel() ? 'Model-generated prose' : 'Deterministic rules engine'}
              </DetailRow>
              <DetailRow label="Environment">{process.env.NODE_ENV}</DetailRow>
              <DetailRow label="Auto-seed">{process.env.AUTO_SEED === 'false' ? 'Disabled' : 'Enabled'}</DetailRow>
            </dl>

            <p className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] leading-relaxed text-text-subtle">
              {driver === 'pglite'
                ? 'Running the embedded database. Data persists to ./.pgdata between restarts. Set DATABASE_URL to point at Supabase or another PostgreSQL server.'
                : 'Connected to an external PostgreSQL server via DATABASE_URL.'}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-text-subtle">
              {isLiveModel()
                ? 'A model is configured. Policy checks, risk levels and comparisons remain computed from the database — the model writes the prose around them.'
                : 'No model key is configured, which is a fully supported mode. Every AI surface works: findings are computed from live records and only the phrasing is templated.'}
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
