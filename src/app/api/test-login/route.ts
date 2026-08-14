import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, userRoles, users } from '@/lib/db/schema';
import { createSessionToken, SESSION_COOKIE, type SessionUser } from '@/lib/auth/session';
import type { Role } from '@/types/domain';

/**
 * Test-support endpoint: issues a session for a seeded demo account without a
 * password, so the smoke test can exercise every route as every role.
 *
 * Gated twice, and inert unless BOTH hold:
 *   - NODE_ENV is not `production`
 *   - ENABLE_TEST_LOGIN=1 is set explicitly
 *
 * It is not enabled by `npm run dev`; `npm run test:routes` sets the flag for the
 * duration of that run. In production the route returns 404 and never touches the
 * database, so it cannot be probed.
 */
function enabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_LOGIN === '1';
}

export async function POST(request: Request) {
  if (!enabled()) return new NextResponse('Not found', { status: 404 });

  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const db = await ready();
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      primaryRole: users.primaryRole,
      isActive: users.isActive,
      employeeId: employees.id,
      name: employees.name,
      position: employees.position,
      departmentId: employees.departmentId,
      departmentCode: departments.code,
      officeId: employees.officeId,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!row || !row.isActive) return NextResponse.json({ error: 'unknown account' }, { status: 404 });

  const roleRows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.userId));
  const roles = roleRows.map((r) => r.role as Role);
  if (!roles.includes(row.primaryRole as Role)) roles.push(row.primaryRole as Role);

  const session: SessionUser = {
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

  const response = NextResponse.json({ ok: true, name: row.name, roles });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
