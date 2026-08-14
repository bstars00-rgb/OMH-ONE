import 'server-only';
import { headers } from 'next/headers';
import { auditLogs } from '@/lib/db/schema';
import type { Database } from '@/lib/db';

export type AuditAction =
  | 'CREATE'
  | 'EDIT'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'CANCEL'
  | 'DELETE'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'POLICY_CHANGE'
  | 'ROLE_CHANGE'
  | 'WORKFLOW_CHANGE'
  | 'SETTING_CHANGE'
  | 'AI_RECOMMENDATION'
  | 'PERMISSION_DENIED';

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail. Never throws into the caller — a logging failure must
 * not roll back a legitimate approval — but it does surface in the server log.
 *
 * Pass the transaction handle when auditing inside one so the entry commits or
 * rolls back with the change it describes.
 */
export async function recordAudit(db: Database, input: AuditInput) {
  try {
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
    } catch {
      // Outside a request scope (e.g. seeding) — no IP available.
    }

    await db.insert(auditLogs).values({
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata ?? null,
      ipAddress: ip,
    });
  } catch (err) {
    console.error('[audit] failed to record entry', input.action, input.entityType, err);
  }
}
