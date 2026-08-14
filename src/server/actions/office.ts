'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { seesAllOffices } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { offices } from '@/lib/db/schema';
import { ALL_OFFICES, OFFICE_COOKIE } from '@/server/auth-guard';
import { LOCALE_COOKIE } from '@/lib/i18n/server';
import { isLocale } from '@/lib/i18n/types';

/**
 * Switches the office a consolidated viewer is looking at.
 *
 * Rejected for anyone without consolidated visibility — writing the cookie by
 * hand would achieve nothing anyway, because `resolveActiveOffice` ignores it
 * for those roles, but refusing here keeps the failure loud rather than silent.
 */
export async function setActiveOfficeAction(officeId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();

  if (!seesAllOffices(session)) {
    return { ok: false, message: 'Your role is limited to your own office.' };
  }

  if (officeId !== ALL_OFFICES) {
    const db = await ready();
    const [office] = await db.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId)).limit(1);
    if (!office) return { ok: false, message: 'Unknown office.' };
  }

  const jar = await cookies();
  jar.set(OFFICE_COOKIE, officeId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath('/', 'layout');
  return { ok: true, message: 'Office switched.' };
}

/** Persists the interface language. Available to everyone. */
export async function setLocaleAction(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    // Not httpOnly: harmless, and lets the theme/language script read it before paint.
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
