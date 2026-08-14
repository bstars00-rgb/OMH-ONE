import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth/session';

/**
 * First line of defence: bounce unauthenticated traffic before it reaches a page.
 *
 * This is a convenience redirect, not the security boundary — every page and
 * server action independently calls `requireSession()` and its own capability
 * check, so removing this file would change the redirect UX and nothing else.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/logout') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/health') ||
    // The route itself returns 404 unless ENABLE_TEST_LOGIN=1 and NODE_ENV is not
    // production, so exempting it here adds no surface.
    pathname.startsWith('/api/test-login') ||
    pathname === '/favicon.ico';

  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSessionToken(token) : null;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the destination so sign-in can return the user to it.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
