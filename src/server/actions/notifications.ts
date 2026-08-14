'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ready } from '@/lib/db/bootstrap';
import { notifications } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/session';

/** Scoped to the caller's own notifications — an id from another user is a no-op. */
export async function markNotificationRead(id: string) {
  const session = await requireSession();
  const db = await ready();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.employeeId, session.employeeId)));
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  const db = await ready();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.employeeId, session.employeeId), eq(notifications.isRead, false)));
  revalidatePath('/', 'layout');
}
