import 'server-only';
import { and, asc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { approvalLineMembers, approvalLines, departments, employees, offices, requests } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';

export type MemberType = 'APPROVER' | 'CC' | 'SHARE';

export interface LineMember {
  employeeId: string;
  name: string;
  position: string | null;
  departmentCode: string | null;
  memberType: MemberType;
  order: number;
}

export interface ApprovalLine {
  id: string;
  name: string;
  /** Null for an organization line, the owner's id for a personal one. */
  ownerId: string | null;
  requestType: string | null;
  members: LineMember[];
}

/**
 * Lines this session may pick from.
 *
 * Organization lines in their office, plus their own personal lines — the two
 * groups the previous system shows as "결재라인" and "My결재라인". Personal
 * lines of other people are never returned; they are a convenience, not a
 * directory.
 */
export async function listApprovalLines(
  session: SessionUser,
  opts: { requestType?: string } = {},
): Promise<ApprovalLine[]> {
  const db = await ready();

  const scope: SQL[] = [eq(approvalLines.isActive, true)];

  // Mine, or shared. A personal line belonging to someone else is not visible.
  const ownership = or(isNull(approvalLines.ownerId), eq(approvalLines.ownerId, session.employeeId));
  if (ownership) scope.push(ownership);

  if (session.activeOfficeId) {
    const office = or(isNull(approvalLines.officeId), eq(approvalLines.officeId, session.activeOfficeId));
    if (office) scope.push(office);
  }

  if (opts.requestType) {
    const byType = or(isNull(approvalLines.requestType), eq(approvalLines.requestType, opts.requestType));
    if (byType) scope.push(byType);
  }

  const rows = await db
    .select({
      id: approvalLines.id,
      name: approvalLines.name,
      ownerId: approvalLines.ownerId,
      requestType: approvalLines.requestType,
      sortOrder: approvalLines.sortOrder,
    })
    .from(approvalLines)
    .where(and(...scope))
    .orderBy(asc(approvalLines.sortOrder), asc(approvalLines.name));

  if (rows.length === 0) return [];

  const members = await db
    .select({
      lineId: approvalLineMembers.lineId,
      employeeId: approvalLineMembers.employeeId,
      memberType: approvalLineMembers.memberType,
      position: approvalLineMembers.position,
      name: employees.name,
      jobTitle: employees.position,
    })
    .from(approvalLineMembers)
    .innerJoin(employees, eq(employees.id, approvalLineMembers.employeeId))
    .orderBy(asc(approvalLineMembers.position));

  const byLine = new Map<string, LineMember[]>();
  for (const m of members) {
    const list = byLine.get(m.lineId) ?? [];
    list.push({
      employeeId: m.employeeId,
      name: m.name,
      position: m.jobTitle,
      departmentCode: null,
      memberType: m.memberType as MemberType,
      order: m.position,
    });
    byLine.set(m.lineId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: r.ownerId,
    requestType: r.requestType,
    members: byLine.get(r.id) ?? [],
  }));
}

export interface AdminApprovalLine extends ApprovalLine {
  officeId: string | null;
  officeCode: string | null;
  isActive: boolean;
  sortOrder: number;
  /** How many requests were submitted starting from this line. */
  uses: number;
}

/**
 * Every organization line, for the administrator managing them.
 *
 * Personal lines are deliberately absent. They belong to the people who made
 * them, and an admin screen that listed everyone's private shortcuts would turn
 * a convenience into surveillance without making anything easier to administer.
 */
export async function listOrgApprovalLines(): Promise<AdminApprovalLine[]> {
  const db = await ready();

  const rows = await db
    .select({
      id: approvalLines.id,
      name: approvalLines.name,
      requestType: approvalLines.requestType,
      officeId: approvalLines.officeId,
      officeCode: offices.code,
      isActive: approvalLines.isActive,
      sortOrder: approvalLines.sortOrder,
    })
    .from(approvalLines)
    .leftJoin(offices, eq(offices.id, approvalLines.officeId))
    .where(isNull(approvalLines.ownerId))
    .orderBy(asc(approvalLines.sortOrder), asc(approvalLines.name));

  if (rows.length === 0) return [];

  const [members, uses] = await Promise.all([
    db
      .select({
        lineId: approvalLineMembers.lineId,
        employeeId: approvalLineMembers.employeeId,
        memberType: approvalLineMembers.memberType,
        position: approvalLineMembers.position,
        name: employees.name,
        jobTitle: employees.position,
        departmentCode: departments.code,
      })
      .from(approvalLineMembers)
      .innerJoin(employees, eq(employees.id, approvalLineMembers.employeeId))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .orderBy(asc(approvalLineMembers.position)),
    db
      .select({ lineId: requests.approvalLineId, n: sql<number>`count(*)::int` })
      .from(requests)
      .where(isNotNull(requests.approvalLineId))
      .groupBy(requests.approvalLineId),
  ]);

  const byLine = new Map<string, LineMember[]>();
  for (const m of members) {
    const list = byLine.get(m.lineId) ?? [];
    list.push({
      employeeId: m.employeeId,
      name: m.name,
      position: m.jobTitle,
      departmentCode: m.departmentCode,
      memberType: m.memberType as MemberType,
      order: m.position,
    });
    byLine.set(m.lineId, list);
  }
  const useCount = new Map(uses.map((u) => [u.lineId ?? '', Number(u.n)]));

  return rows.map((r) => ({
    ...r,
    ownerId: null,
    members: byLine.get(r.id) ?? [],
    uses: useCount.get(r.id) ?? 0,
  }));
}
