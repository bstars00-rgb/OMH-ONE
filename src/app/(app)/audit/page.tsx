import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { auditLogs, employees } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage, NoResults } from '@/components/ui/states';
import { Avatar, Badge, Card } from '@/components/ui/primitives';
import { TableWrap, THead, TH, TBody, TR, TD, Pagination } from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';
import { humanize } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit Logs' };

const ACTION_TONE: Record<string, string> = {
  APPROVE: 'emerald',
  REJECT: 'rose',
  RETURN: 'orange',
  CANCEL: 'slate',
  SUBMIT: 'blue',
  CREATE: 'slate',
  LOGIN: 'slate',
  LOGOUT: 'slate',
  LOGIN_FAILED: 'rose',
  PERMISSION_DENIED: 'rose',
  EXPORT: 'violet',
  POLICY_CHANGE: 'amber',
  WORKFLOW_CHANGE: 'amber',
  ROLE_CHANGE: 'amber',
  SETTING_CHANGE: 'amber',
};

const PAGE_SIZE = 40;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!can(session, 'audit.view')) return <ForbiddenPage what="audit logs" />;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s?.trim() || undefined;
  };

  const action = one('action');
  const entityType = one('entity');
  const q = one('q');
  const page = Math.max(1, Number(one('page') ?? 1) || 1);

  const clauses: (SQL | undefined)[] = [];
  if (action) clauses.push(eq(auditLogs.action, action));
  if (entityType) clauses.push(eq(auditLogs.entityType, entityType));
  if (q) {
    const like = `%${q}%`;
    clauses.push(or(ilike(auditLogs.summary, like), ilike(auditLogs.actorEmail, like)));
  }
  const where = clauses.filter(Boolean).length ? and(...(clauses.filter(Boolean) as SQL[])) : undefined;

  const db = await ready();
  const [rows, [{ total }], actions] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        actorEmail: auditLogs.actorEmail,
        actorName: employees.name,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(employees, eq(employees.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    db.select({ action: auditLogs.action, n: sql<number>`count(*)::int` }).from(auditLogs).groupBy(auditLogs.action).orderBy(desc(sql`count(*)`)),
  ]);

  const params = new URLSearchParams();
  for (const k of ['action', 'entity', 'q']) {
    const v = one(k);
    if (v) params.set(k, v);
  }

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Every recorded action, newest first. Append-only — entries are never edited or removed."
      />

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search summary or actor email…"
          aria-label="Search audit log"
          className="h-8 max-w-xs flex-1 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
        />
        <label className="sr-only" htmlFor="action">
          Filter by action
        </label>
        <select
          id="action"
          name="action"
          defaultValue={action ?? ''}
          className="h-8 rounded-[var(--radius-control)] border border-border-strong bg-surface px-2 text-sm text-text"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {humanize(a.action)} ({a.n})
            </option>
          ))}
        </select>
        <button type="submit" className="h-8 rounded-[var(--radius-control)] bg-accent px-3 text-xs font-medium text-accent-fg">
          Filter
        </button>
        {(q || action) && (
          <Link href="/audit" className="text-xs text-text-muted hover:text-text hover:underline">
            Clear
          </Link>
        )}
        <span className="ml-auto text-xs text-text-muted tabular">{total.toLocaleString()} entries</span>
      </form>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <NoResults onReset={<Link href="/audit" className="text-xs text-accent hover:underline">Clear filters</Link>} />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Summary</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-text-muted tabular">{formatDateTime(r.createdAt)}</TD>
                    <TD>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Avatar name={r.actorName ?? r.actorEmail ?? 'System'} size="xs" />
                        <span className="truncate">{r.actorName ?? r.actorEmail ?? 'System'}</span>
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={ACTION_TONE[r.action] ?? 'slate'}>{humanize(r.action)}</Badge>
                    </TD>
                    <TD className="text-text-muted">
                      {r.entityType === 'request' && r.entityId ? (
                        <Link href={`/requests/${r.entityId}`} className="text-accent hover:underline">
                          request
                        </Link>
                      ) : (
                        humanize(r.entityType)
                      )}
                    </TD>
                    <TD className="max-w-96 truncate" title={r.summary ?? undefined}>
                      {r.summary ?? '—'}
                    </TD>
                    <TD className="text-text-subtle tabular">{r.ipAddress ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              makeHref={(p) => {
                const next = new URLSearchParams(params.toString());
                next.set('page', String(p));
                return `?${next.toString()}`;
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
