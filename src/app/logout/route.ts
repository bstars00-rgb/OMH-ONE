import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Clears the session and returns to the login screen.
 *
 * This exists as a route handler because cookies cannot be modified during
 * render — a layout that discovers a stale session redirects here rather than
 * trying to delete the cookie itself.
 */
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get('reason');
  const target = new URL(reason ? `/login?reason=${encodeURIComponent(reason)}` : '/login', request.url);
  const response = NextResponse.redirect(target);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
