'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, userRoles, users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { clearSessionCookie, getSession, setSessionCookie, type SessionUser } from '@/lib/auth/session';
import { recordAudit } from '@/server/audit';
import type { Role } from '@/types/domain';

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email and password.' };

  const db = await ready();

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      primaryRole: users.primaryRole,
      employeeId: employees.id,
      name: employees.name,
      position: employees.position,
      departmentId: employees.departmentId,
      departmentCode: departments.code,
      officeId: employees.officeId,
      employeeStatus: employees.status,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(users.email, email))
    .limit(1);

  // Same message whether the account is missing, disabled or the password is
  // wrong — a login form should not confirm which emails exist.
  const GENERIC = 'Email or password is incorrect.';

  if (!row) {
    await recordAudit(db, { action: 'LOGIN_FAILED', entityType: 'session', actorEmail: email, summary: 'Unknown email' });
    return { error: GENERIC };
  }

  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    await recordAudit(db, {
      action: 'LOGIN_FAILED',
      entityType: 'session',
      actorEmail: email,
      actorId: row.employeeId,
      summary: 'Incorrect password',
    });
    return { error: GENERIC };
  }

  if (!row.isActive || row.employeeStatus === 'RESIGNED') {
    await recordAudit(db, {
      action: 'LOGIN_FAILED',
      entityType: 'session',
      actorEmail: email,
      actorId: row.employeeId,
      summary: 'Inactive account',
    });
    return { error: GENERIC };
  }

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

  await setSessionCookie(session);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.userId));
  await recordAudit(db, {
    action: 'LOGIN',
    entityType: 'session',
    actorId: row.employeeId,
    actorEmail: row.email,
    summary: `${row.name} signed in`,
    metadata: { roles },
  });

  redirect(safeRedirect(formData.get('next')));
}

/**
 * Only same-origin, path-relative targets are honoured. A `next` value like
 * `//evil.example` or `https://evil.example` would otherwise turn the login form
 * into an open redirect.
 */
function safeRedirect(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    const db = await ready();
    await recordAudit(db, {
      action: 'LOGOUT',
      entityType: 'session',
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${session.name} signed out`,
    });
  }
  await clearSessionCookie();
  redirect('/login');
}
