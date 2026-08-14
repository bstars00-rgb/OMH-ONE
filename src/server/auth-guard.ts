import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, offices, userRoles, users } from '@/lib/db/schema';
import { requireSession, type SessionUser } from '@/lib/auth/session';
import { seesAllOffices } from '@/lib/rbac';
import type { Role } from '@/types/domain';

/** Cookie holding the office a consolidated viewer has narrowed to. */
export const OFFICE_COOKIE = 'ohmy_office';
export const ALL_OFFICES = 'all';

/**
 * Session validation against the database.
 *
 * A signed cookie proves the token was issued by us; it does not prove the
 * account still exists or still has the same roles. Without this check a user
 * whose account was removed (or whose role was revoked) would keep working from
 * a stale token until it expired — and after a database reset the app would show
 * an empty, confusing shell instead of a login screen.
 *
 * Roles are re-read here too, so a role change takes effect on the next page
 * load rather than the next sign-in.
 */
export async function requireLiveSession(): Promise<SessionUser> {
  const session = await requireSession();
  const db = await ready();

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      isActive: users.isActive,
      primaryRole: users.primaryRole,
      employeeId: employees.id,
      name: employees.name,
      position: employees.position,
      departmentId: employees.departmentId,
      departmentCode: departments.code,
      officeId: employees.officeId,
      status: employees.status,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(users.id, session.userId))
    .limit(1);

  // Cookies cannot be deleted during render, so hand off to the logout route,
  // which clears the cookie and lands the user on the sign-in screen.
  if (!row || !row.isActive || row.status === 'RESIGNED') {
    redirect('/logout?reason=session-expired');
  }

  const roleRows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.userId));
  const roles = roleRows.map((r) => r.role as Role);
  if (!roles.includes(row.primaryRole as Role)) roles.push(row.primaryRole as Role);

  // Returned from the database, not the cookie, so a role or department change
  // applies on the next page load. The cookie only ever carries identity.
  const base: SessionUser = {
    userId: row.userId,
    employeeId: row.employeeId,
    email: row.email,
    name: row.name,
    primaryRole: row.primaryRole as Role,
    roles,
    departmentId: row.departmentId,
    departmentCode: row.departmentCode,
    officeId: row.officeId,
    position: row.position,
  };

  return { ...base, activeOfficeId: await resolveActiveOffice(base) };
}

/**
 * Decides which office this request is scoped to.
 *
 * Ordinary staff are pinned to their own office — the cookie is ignored, so
 * hand-editing it cannot widen access. Consolidated roles may select one office
 * (or none, meaning all); their selection is validated against the office table
 * so a stale or invented id falls back to the consolidated view rather than
 * silently matching nothing.
 */
async function resolveActiveOffice(session: SessionUser): Promise<string | null> {
  if (!seesAllOffices(session)) return session.officeId;

  const jar = await cookies();
  const selected = jar.get(OFFICE_COOKIE)?.value;
  if (!selected || selected === ALL_OFFICES) return null;

  const db = await ready();
  const [office] = await db.select({ id: offices.id }).from(offices).where(eq(offices.id, selected)).limit(1);
  return office?.id ?? null;
}
