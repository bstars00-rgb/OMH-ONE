import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { universalSearch } from '@/server/queries/search';

/**
 * Search endpoint for the header box and command bar.
 * Authorization is re-checked here — a route handler is reachable directly.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ hits: [] });

  try {
    const hits = await universalSearch(session, q);
    return NextResponse.json({ hits });
  } catch (err) {
    console.error('[search] failed', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
