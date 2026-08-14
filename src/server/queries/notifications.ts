import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { notifications, requests } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/session';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: string;
  isRead: boolean;
  createdAt: Date;
  requestId: string | null;
  requestNumber: string | null;
}

export async function listNotifications(session: SessionUser, limit = 20): Promise<NotificationRow[]> {
  const db = await ready();
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      severity: notifications.severity,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      requestId: notifications.requestId,
      requestNumber: requests.requestNumber,
    })
    .from(notifications)
    .leftJoin(requests, eq(requests.id, notifications.requestId))
    .where(eq(notifications.employeeId, session.employeeId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(session: SessionUser): Promise<number> {
  const db = await ready();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.employeeId, session.employeeId), eq(notifications.isRead, false)));
  return Number(row?.n ?? 0);
}
