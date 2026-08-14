import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@/types/domain';

export const SESSION_COOKIE = 'ohmy_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8h working day

export interface SessionUser {
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  primaryRole: Role;
  roles: Role[];
  departmentId: string | null;
  departmentCode: string | null;
  /** The office this person belongs to — their tenant. */
  officeId: string | null;
  position: string | null;
  /**
   * Office the session is currently looking at.
   *
   * For most people this equals `officeId` and cannot be changed. Roles with
   * consolidated visibility (executives, Finance, admins, auditors) may narrow to
   * a single office; `null` for them means "all offices". Resolved per request in
   * `requireLiveSession`, never trusted from the cookie alone.
   */
  activeOfficeId?: string | null;
}

function secret() {
  const s = process.env.AUTH_SECRET ?? 'ohmy-ai-erp-development-secret-change-me-in-production';
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('ohmy-ai-erp')
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'ohmy-ai-erp' });
    if (!payload.userId || !payload.employeeId) return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in user or null. Never throws. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

/**
 * Server-side gate. Every page and action that touches data calls this —
 * the client is never trusted for identity or role.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
