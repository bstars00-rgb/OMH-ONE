'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalLineMembers, approvalLines, employees } from '@/lib/db/schema';
import { getT } from '@/lib/i18n/server';

export interface LineResult {
  ok: boolean;
  message: string;
}

/**
 * Saves the current chain as one of the requester's own lines.
 *
 * Personal, not organizational: someone who files the same expense every month
 * should be able to keep their route without an administrator publishing it for
 * the whole company. Re-saving the same name overwrites, because "save" here
 * means "this is my line for this", not "keep a version history".
 */
export async function saveMyLineAction(
  name: string,
  approverIds: string[],
  requestType?: string,
): Promise<LineResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');
    const t = await getT();

    const trimmed = name.trim();
    if (trimmed.length < 2) return { ok: false, message: t('chain.needName') };
    if (trimmed.length > 80) return { ok: false, message: t('valid.tooLong', { max: 80 }) };

    // Only real people, no duplicates, never the requester.
    const db = await ready();
    const unique = [...new Set(approverIds)].filter((id) => id && id !== session.employeeId);
    if (unique.length === 0) return { ok: false, message: t('chain.needApprover') };

    const known = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.status, 'ACTIVE')));
    const valid = unique.filter((id) => known.some((k) => k.id === id));
    if (valid.length === 0) return { ok: false, message: t('chain.needApprover') };

    const [existing] = await db
      .select({ id: approvalLines.id })
      .from(approvalLines)
      .where(and(eq(approvalLines.ownerId, session.employeeId), eq(approvalLines.name, trimmed)))
      .limit(1);

    let lineId: string;
    if (existing) {
      lineId = existing.id;
      await db.update(approvalLines).set({ requestType: requestType ?? null, updatedAt: new Date() }).where(eq(approvalLines.id, lineId));
      await db.delete(approvalLineMembers).where(eq(approvalLineMembers.lineId, lineId));
    } else {
      lineId = crypto.randomUUID();
      await db.insert(approvalLines).values({
        id: lineId,
        name: trimmed,
        ownerId: session.employeeId,
        officeId: session.officeId ?? null,
        requestType: requestType ?? null,
        sortOrder: 1, // personal lines sort above organization ones
      });
    }

    await db.insert(approvalLineMembers).values(
      valid.map((employeeId, i) => ({ lineId, employeeId, memberType: 'APPROVER', position: i + 1 })),
    );

    revalidatePath('/requests/new');
    return { ok: true, message: t('chain.saved', { name: trimmed }) };
  } catch (err) {
    console.error('[approval-lines] save failed', err);
    return { ok: false, message: (await getT())('set.saveFailed') };
  }
}

export async function deleteMyLineAction(lineId: string): Promise<LineResult> {
  try {
    const session = await requireSession();
    const t = await getT();
    const db = await ready();

    // Ownership is the authorization: a personal line can only be removed by
    // the person it belongs to, and organization lines are not deletable here.
    const [line] = await db
      .select({ id: approvalLines.id, name: approvalLines.name })
      .from(approvalLines)
      .where(and(eq(approvalLines.id, lineId), eq(approvalLines.ownerId, session.employeeId)))
      .limit(1);
    if (!line) return { ok: false, message: t('chain.lineNotFound') };

    await db.delete(approvalLines).where(eq(approvalLines.id, lineId));
    revalidatePath('/requests/new');
    return { ok: true, message: t('chain.lineDeleted', { name: line.name }) };
  } catch (err) {
    console.error('[approval-lines] delete failed', err);
    return { ok: false, message: (await getT())('set.saveFailed') };
  }
}
