import 'server-only';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { approvalLineMembers, approvalLines, employees, requests } from '@/lib/db/schema';
import { can } from '@/lib/rbac';
import { recordAudit } from '@/server/audit';
import { approvalLineSchema, type ApprovalLineInput } from '@/lib/validation/approval-lines';
import type { SessionUser } from '@/lib/auth/session';
import type { Vars } from '@/lib/i18n/types';

/**
 * Outcome carrying a message key rather than a sentence.
 *
 * Only a server action can read the locale cookie, so the service says what
 * happened and the action says it in the caller's language. That seam is also
 * what makes these paths testable: the QA suite calls the service directly.
 */
export interface LineOutcome {
  ok: boolean;
  key: string;
  vars?: Vars;
  lineId?: string;
}

const fail = (key: string, vars?: Vars): LineOutcome => ({ ok: false, key, vars });

/** Organization lines are published for everyone; personal ones are not. */
function mayPublish(session: SessionUser) {
  return can(session, 'admin.workflow');
}

/**
 * Creates or replaces an approval line.
 *
 * `scope` decides both the authorization and the ownership: a personal line is
 * owned by the caller and needs nothing but the ability to file requests, while
 * an organization line has no owner, appears for a whole office, and needs the
 * administrative capability.
 *
 * Members are replaced wholesale rather than diffed. A line is a short ordered
 * list, and "save" here means "this is the line now" — reconciling positions
 * one by one would add a failure mode without adding a capability.
 */
export async function saveApprovalLine(
  session: SessionUser,
  scope: 'personal' | 'organization',
  raw: unknown,
): Promise<LineOutcome> {
  if (scope === 'organization' && !mayPublish(session)) return fail('wfError.noPermission');

  const parsed = approvalLineSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'line.checkValues');
  const input: ApprovalLineInput = parsed.data;

  const db = await ready();
  const ownerId = scope === 'personal' ? session.employeeId : null;

  // Real, active people only, in the order given, without repeats. A personal
  // line also excludes its owner: routing skips a step that resolves to the
  // requester, so keeping them on the list would only mislead.
  const seen = new Set<string>();
  const wanted = input.approverIds.filter((id) => {
    if (!id || seen.has(id)) return false;
    if (scope === 'personal' && id === session.employeeId) return false;
    seen.add(id);
    return true;
  });
  if (wanted.length === 0) return fail('line.needApprover');

  const active = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.status, 'ACTIVE'), sql`${employees.id} in ${wanted}`));
  const activeIds = new Set(active.map((a) => a.id));
  const members = wanted.filter((id) => activeIds.has(id));
  if (members.length !== wanted.length) return fail('line.inactiveApprover');

  // Names are how people tell lines apart in a dropdown, so they are unique
  // within a scope rather than globally.
  const nameClash = await db
    .select({ id: approvalLines.id })
    .from(approvalLines)
    .where(
      and(
        eq(approvalLines.name, input.name),
        ownerId ? eq(approvalLines.ownerId, ownerId) : isNull(approvalLines.ownerId),
        input.id ? ne(approvalLines.id, input.id) : undefined,
      ),
    )
    .limit(1);
  if (nameClash.length > 0) return fail('line.nameTaken', { name: input.name });

  let lineId = input.id ?? '';
  if (input.id) {
    const [existing] = await db.select().from(approvalLines).where(eq(approvalLines.id, input.id)).limit(1);
    if (!existing) return fail('line.notFound');
    // A personal line is only editable by the person it belongs to.
    if (existing.ownerId && existing.ownerId !== session.employeeId) return fail('wfError.noPermission');
    if (!existing.ownerId && !mayPublish(session)) return fail('wfError.noPermission');

    await db
      .update(approvalLines)
      .set({
        name: input.name,
        requestType: input.requestType ?? null,
        officeId: input.officeId ?? null,
        departmentId: input.departmentId ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(approvalLines.id, input.id));
    await db.delete(approvalLineMembers).where(eq(approvalLineMembers.lineId, input.id));
  } else {
    lineId = crypto.randomUUID();
    await db.insert(approvalLines).values({
      id: lineId,
      name: input.name,
      ownerId,
      officeId: input.officeId ?? (scope === 'personal' ? (session.officeId ?? null) : null),
      requestType: input.requestType ?? null,
      departmentId: input.departmentId ?? null,
      isActive: input.isActive,
      // Personal lines sort above organization ones so a person's own choices
      // are the first thing they see.
      sortOrder: scope === 'personal' ? 1 : input.sortOrder,
    });
  }

  await db.insert(approvalLineMembers).values(
    members.map((employeeId, i) => ({ lineId, employeeId, memberType: 'APPROVER', position: i + 1 })),
  );

  if (scope === 'organization') {
    await recordAudit(db, {
      action: input.id ? 'EDIT' : 'CREATE',
      entityType: 'approval_line',
      entityId: lineId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Approval line "${input.name}" ${input.id ? 'updated' : 'created'} with ${members.length} approver(s)`,
      metadata: { requestType: input.requestType ?? null, approvers: members.length, isActive: input.isActive },
    });
  }

  return { ok: true, key: input.id ? 'line.saved' : 'line.created', vars: { name: input.name }, lineId };
}

/**
 * Removes an approval line.
 *
 * Deleting a line does not touch the requests that were submitted through it:
 * approval steps are materialized at submission, so history keeps the people it
 * was actually routed to. The line is only a starting point, so it is safe to
 * remove — the count of past uses is reported rather than used as a block.
 */
export async function deleteApprovalLine(session: SessionUser, lineId: string): Promise<LineOutcome> {
  const db = await ready();
  const [line] = await db.select().from(approvalLines).where(eq(approvalLines.id, lineId)).limit(1);
  if (!line) return fail('line.notFound');

  if (line.ownerId) {
    if (line.ownerId !== session.employeeId) return fail('wfError.noPermission');
  } else if (!mayPublish(session)) {
    return fail('wfError.noPermission');
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(requests)
    .where(eq(requests.approvalLineId, lineId));

  await db.delete(approvalLines).where(eq(approvalLines.id, lineId));

  if (!line.ownerId) {
    await recordAudit(db, {
      action: 'DELETE',
      entityType: 'approval_line',
      entityId: lineId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Approval line "${line.name}" deleted (used by ${Number(n)} past request(s))`,
      metadata: { name: line.name, pastUses: Number(n) },
    });
  }

  return { ok: true, key: 'line.deleted', vars: { name: line.name } };
}
