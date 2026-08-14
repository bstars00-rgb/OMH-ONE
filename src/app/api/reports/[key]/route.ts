import { getSession } from '@/lib/auth/session';
import { can, type Capability } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { recordAudit } from '@/server/audit';
import { REPORTS, runReport, toCsv } from '@/server/queries/reports';

/**
 * CSV download for a preset report.
 *
 * Re-authorizes here rather than trusting the page that linked to it, checks the
 * report's own capability, and records the export in the audit log — an export is
 * a data-egress event and auditors expect to see it.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { key } = await ctx.params;
  const definition = REPORTS.find((r) => r.key === key);
  if (!definition) return new Response('Unknown report', { status: 404 });

  if (!can(session, definition.capability as Capability)) {
    return new Response('Your role does not allow exporting this report.', { status: 403 });
  }

  try {
    const rows = await runReport(session, key);
    if (!rows) return new Response('Unknown report', { status: 404 });

    const csv = toCsv(rows);
    const db = await ready();
    await recordAudit(db, {
      action: 'EXPORT',
      entityType: 'report',
      entityId: key,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Exported ${definition.name} (${rows.length} rows)`,
      metadata: { rows: rows.length },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ohmy-${key}-${stamp}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[reports] export failed', key, err);
    return new Response('The report could not be generated.', { status: 500 });
  }
}
