/**
 * Role-based access control.
 *
 * Two layers, both server-side:
 *  1. `can(session, capability)` — coarse gate for pages, nav items and actions.
 *  2. `requestVisibility(session)` — a SQL predicate folded into every request
 *     query, so a user cannot reach another department's row by guessing a URL.
 *
 * The client never decides access. Nav hiding is cosmetic only; the page
 * itself re-checks.
 */
import { and, eq, exists, inArray, or, sql, type SQL } from 'drizzle-orm';
import { approvalSteps, requests } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@/types/domain';

export type Capability =
  | 'request.create'
  | 'request.approve'
  | 'request.viewAll'
  | 'employee.viewAll'
  | 'employee.manage'
  | 'leave.manageAll'
  | 'finance.view'
  | 'budget.manage'
  | 'analytics.view'
  | 'analytics.company'
  | 'reports.export'
  | 'audit.view'
  | 'admin.workflow'
  | 'admin.policy'
  | 'admin.users'
  | 'admin.settings'
  | 'admin.organization';

const CAPABILITIES: Record<Capability, Role[]> = {
  'request.create': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'FINANCE', 'MANAGER', 'EMPLOYEE'],
  'request.approve': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'FINANCE', 'MANAGER'],
  'request.viewAll': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'AUDITOR'],
  'employee.viewAll': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'AUDITOR', 'MANAGER'],
  'employee.manage': ['SUPER_ADMIN', 'ADMIN', 'HR'],
  'leave.manageAll': ['SUPER_ADMIN', 'ADMIN', 'HR', 'DIRECTOR'],
  'finance.view': ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'DIRECTOR', 'AUDITOR'],
  'budget.manage': ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],
  'analytics.view': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'FINANCE', 'MANAGER', 'AUDITOR'],
  'analytics.company': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'AUDITOR'],
  'reports.export': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'FINANCE', 'AUDITOR'],
  'audit.view': ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'AUDITOR'],
  'admin.workflow': ['SUPER_ADMIN', 'ADMIN'],
  'admin.policy': ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],
  'admin.users': ['SUPER_ADMIN', 'ADMIN'],
  'admin.settings': ['SUPER_ADMIN', 'ADMIN'],
  'admin.organization': ['SUPER_ADMIN', 'ADMIN', 'HR'],
};

/** Auditor is read-only everywhere, including approvals. */
const READ_ONLY_ROLES: Role[] = ['AUDITOR'];

/**
 * Roles that see across offices.
 *
 * Each office (본사 and each 지사) is a tenant: staff see their own office only,
 * so a Vietnam manager cannot browse Korea's requests. Executives, Finance,
 * administrators and auditors need the consolidated view — group reporting and
 * group accounting are the whole point of running one system rather than three.
 *
 * Finance is included deliberately: 회계팀 closes the books for the group, so
 * scoping them to one office would make consolidated accounting impossible.
 */
const CONSOLIDATED_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'FINANCE', 'AUDITOR'];

/** True when this session may see every office rather than only its own. */
export function seesAllOffices(session: SessionUser): boolean {
  return hasRole(session, ...CONSOLIDATED_ROLES);
}

export function rolesOf(session: SessionUser): Role[] {
  const set = new Set<Role>(session.roles ?? []);
  set.add(session.primaryRole);
  return [...set];
}

export function hasRole(session: SessionUser, ...roles: Role[]): boolean {
  const mine = rolesOf(session);
  return roles.some((r) => mine.includes(r));
}

export function can(session: SessionUser | null, capability: Capability): boolean {
  if (!session) return false;
  const mine = rolesOf(session);
  if (READ_ONLY_ROLES.some((r) => mine.includes(r)) && isMutating(capability)) return false;
  return CAPABILITIES[capability].some((r) => mine.includes(r));
}

function isMutating(c: Capability) {
  return (
    c === 'request.create' ||
    c === 'request.approve' ||
    c === 'employee.manage' ||
    c === 'budget.manage' ||
    c.startsWith('admin.')
  );
}

export function assertCan(session: SessionUser, capability: Capability) {
  if (!can(session, capability)) {
    throw new PermissionError('wfError.noPermission', { capability });
  }
}

/** Carries an i18n key, like WorkflowError. */
export class PermissionError extends Error {
  readonly code = 'PERMISSION_DENIED';
  readonly vars?: Record<string, string | number>;
  constructor(messageKey = 'wfError.noPermission', vars?: Record<string, string | number>) {
    super(messageKey);
    this.name = 'PermissionError';
    this.vars = vars;
  }
}

/* ------------------------------------------------------------------ */
/* Row-level visibility                                                */
/* ------------------------------------------------------------------ */

/**
 * SQL predicate limiting which `requests` rows a session may read.
 *
 *  EMPLOYEE   own requests, plus anything they are a named approver on
 *  MANAGER    + own department
 *  HR         + all LEAVE / HR requests company-wide
 *  FINANCE    + all EXPENSE / PURCHASE requests company-wide
 *  DIRECTOR / ADMIN / AUDITOR   everything
 */
export function requestVisibility(session: SessionUser): SQL | undefined {
  // `activeOfficeId` is resolved once per request in requireLiveSession: it is
  // the session's own office for ordinary staff, and either a chosen office or
  // null (= all) for consolidated roles. Reading it here rather than taking a
  // parameter keeps every caller unchanged and makes the scope impossible to
  // forget at a call site.
  const officeClause = session.activeOfficeId ? eq(requests.officeId, session.activeOfficeId) : undefined;

  if (can(session, 'request.viewAll')) {
    return officeClause; // unrestricted within the selected office
  }

  const clauses: (SQL | undefined)[] = [
    eq(requests.requesterId, session.employeeId),
    // Named as an approver on any step of this request.
    exists(
      sql`(select 1 from ${approvalSteps} where ${approvalSteps.requestId} = ${requests.id} and ${approvalSteps.approverId} = ${session.employeeId})`,
    ),
  ];

  if (hasRole(session, 'MANAGER') && session.departmentId) {
    clauses.push(eq(requests.departmentId, session.departmentId));
  }
  if (hasRole(session, 'HR')) {
    clauses.push(inArray(requests.requestType, ['LEAVE', 'HR']));
  }
  if (hasRole(session, 'FINANCE')) {
    clauses.push(inArray(requests.requestType, ['EXPENSE', 'PURCHASE']));
  }

  const roleClause = or(...(clauses.filter(Boolean) as SQL[]));

  // Office scope is an AND on top of role scope: being an approver on a request
  // does not grant a tour of that office's other requests.
  return officeClause ? and(roleClause, officeClause) : roleClause;
}

/**
 * Alias-aware raw-SQL form of `requestVisibility`.
 *
 * `requestVisibility` builds its predicate from Drizzle column references, which
 * serialize as `"requests"."requester_id"`. That is correct inside the query
 * builder, but wrong inside a hand-written statement that aliases the table
 * (`from requests r`) — Postgres then cannot resolve `requests`. Analytics and
 * reports are written as raw SQL for the aggregate work, so they use this form
 * and pass their own alias.
 *
 * The two functions must express the same rules; the table below mirrors
 * `requestVisibility` exactly.
 */
export function visibilitySql(session: SessionUser, alias = 'requests'): SQL {
  const a = sql.raw(`"${alias.replace(/"/g, '')}"`);
  const officeClause: SQL | null = session.activeOfficeId ? sql`${a}.office_id = ${session.activeOfficeId}` : null;

  if (can(session, 'request.viewAll')) {
    return officeClause ?? sql`true`;
  }

  const clauses: SQL[] = [
    sql`${a}.requester_id = ${session.employeeId}`,
    sql`exists (select 1 from approval_steps vs where vs.request_id = ${a}.id and vs.approver_id = ${session.employeeId})`,
  ];

  if (hasRole(session, 'MANAGER') && session.departmentId) {
    clauses.push(sql`${a}.department_id = ${session.departmentId}`);
  }
  if (hasRole(session, 'HR')) {
    clauses.push(sql`${a}.request_type in ('LEAVE','HR')`);
  }
  if (hasRole(session, 'FINANCE')) {
    clauses.push(sql`${a}.request_type in ('EXPENSE','PURCHASE')`);
  }

  const roleClause = sql`(${sql.join(clauses, sql` or `)})`;
  return officeClause ? sql`(${roleClause} and ${officeClause})` : roleClause;
}

/** In-memory equivalent of `requestVisibility`, for rows already loaded. */
export function canViewRequest(
  session: SessionUser,
  row: { requesterId: string; departmentId: string | null; requestType: string; officeId?: string | null },
  approverIds: string[] = [],
): boolean {
  // Own requests and requests you approve are always visible, even across
  // offices — an approver named on a step must be able to open it.
  if (row.requesterId === session.employeeId) return true;
  if (approverIds.includes(session.employeeId)) return true;

  // Office scope gates everything else.
  if (!seesAllOffices(session) && session.officeId && row.officeId && row.officeId !== session.officeId) {
    return false;
  }

  if (can(session, 'request.viewAll')) return true;
  if (hasRole(session, 'MANAGER') && session.departmentId && row.departmentId === session.departmentId) return true;
  if (hasRole(session, 'HR') && ['LEAVE', 'HR'].includes(row.requestType)) return true;
  if (hasRole(session, 'FINANCE') && ['EXPENSE', 'PURCHASE'].includes(row.requestType)) return true;
  return false;
}

/** Only the requester may edit, and only while the request is still open to change. */
export function canEditRequest(session: SessionUser, row: { requesterId: string; status: string }): boolean {
  if (hasRole(session, 'AUDITOR')) return false;
  return row.requesterId === session.employeeId && ['DRAFT', 'RETURNED'].includes(row.status);
}

export function canCancelRequest(session: SessionUser, row: { requesterId: string; status: string }): boolean {
  if (hasRole(session, 'AUDITOR')) return false;
  return (
    row.requesterId === session.employeeId && ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED'].includes(row.status)
  );
}

/**
 * Decision authority: the session must be the *named approver of the current
 * pending step*. Admins may act as a delegate (recorded in the audit log).
 */
export function canActOnStep(
  session: SessionUser,
  step: { approverId: string | null; status: string } | null | undefined,
): boolean {
  if (!step) return false;
  if (hasRole(session, 'AUDITOR')) return false;
  if (!['PENDING', 'IN_REVIEW'].includes(step.status)) return false;
  if (step.approverId === session.employeeId) return true;
  return hasRole(session, 'SUPER_ADMIN', 'ADMIN');
}

/** Employee record visibility (People module). */
export function canViewEmployee(session: SessionUser, employee: { id: string; departmentId: string | null }) {
  if (employee.id === session.employeeId) return true;
  if (can(session, 'employee.viewAll')) {
    // Managers see their own department only.
    if (hasRole(session, 'MANAGER') && !hasRole(session, 'HR', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR')) {
      return employee.departmentId === session.departmentId;
    }
    return true;
  }
  return false;
}

/** i18n key describing what this session can see, plus any interpolation. */
export function scopeLabelKey(session: SessionUser): { key: string; vars?: Record<string, string> } {
  if (can(session, 'request.viewAll')) return { key: 'scope.company' };
  if (hasRole(session, 'HR')) return { key: 'scope.hr' };
  if (hasRole(session, 'FINANCE')) return { key: 'scope.finance' };
  if (hasRole(session, 'MANAGER')) return { key: 'scope.department', vars: { dept: session.departmentCode ?? '—' } };
  return { key: 'scope.own' };
}

export function scopeLabel(session: SessionUser): string {
  if (can(session, 'request.viewAll')) return 'Company-wide';
  if (hasRole(session, 'HR')) return 'HR & leave scope';
  if (hasRole(session, 'FINANCE')) return 'Finance scope';
  if (hasRole(session, 'MANAGER')) return `${session.departmentCode ?? 'Department'} scope`;
  return 'Your requests';
}

export const and_ = and; // re-export to keep query files importing from one place
