'use server';

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { approvalWorkflowSteps, approvalWorkflows, policies, systemSettings, userRoles, users } from '@/lib/db/schema';
import { recordAudit } from '@/server/audit';
import { APPROVER_ROLES, ROLES } from '@/types/domain';

export interface AdminResult {
  ok: boolean;
  message: string;
}

function fail(err: unknown): AdminResult {
  if (err instanceof PermissionError) return { ok: false, message: err.message };
  console.error('[admin] action failed', err);
  return { ok: false, message: 'The change could not be saved. Please try again.' };
}

/* ------------------------------------------------------------------ */
/* Workflow builder                                                    */
/* ------------------------------------------------------------------ */

const stepSchema = z.object({
  name: z.string().trim().min(2).max(80),
  approverRole: z.enum(APPROVER_ROLES),
  slaHours: z.coerce.number().int().min(1).max(720),
  conditionType: z.enum(['ALWAYS', 'AMOUNT_GT', 'DAYS_GT', 'INTERNATIONAL', 'QUOTATIONS_LT']),
  conditionValue: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
});

const workflowSchema = z.object({
  workflowId: z.string().uuid(),
  description: z.string().trim().max(300).optional(),
  steps: z.array(stepSchema).min(1, 'A workflow needs at least one step.').max(8),
});

/**
 * Replaces a workflow's template steps.
 *
 * Only *template* steps are rewritten. Requests already in flight keep the steps
 * that were materialized when they were submitted, so changing a route never
 * rewrites approval history — a hard requirement for anything auditable.
 */
export async function saveWorkflowAction(raw: unknown): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.workflow');

    const parsed = workflowSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the workflow steps.' };
    }
    const { workflowId, description, steps } = parsed.data;

    const db = await ready();
    const [existing] = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, workflowId)).limit(1);
    if (!existing) return { ok: false, message: 'Workflow not found.' };

    await db.transaction(async (tx) => {
      await tx.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, workflowId));
      await tx.insert(approvalWorkflowSteps).values(
        steps.map((s, i) => ({
          workflowId,
          stepOrder: i + 1,
          name: s.name,
          approverRole: s.approverRole,
          slaHours: s.slaHours,
          conditionType: s.conditionType,
          conditionValue:
            s.conditionType === 'ALWAYS' || s.conditionType === 'INTERNATIONAL' || s.conditionValue == null
              ? null
              : String(s.conditionValue),
        })),
      );
      await tx
        .update(approvalWorkflows)
        .set({ description: description ?? existing.description, updatedAt: new Date() })
        .where(eq(approvalWorkflows.id, workflowId));
    });

    const db2 = await ready();
    await recordAudit(db2, {
      action: 'WORKFLOW_CHANGE',
      entityType: 'approval_workflow',
      entityId: workflowId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${existing.name} updated to ${steps.length} step(s)`,
      metadata: { steps: steps.map((s) => `${s.name}/${s.approverRole}/${s.conditionType}`) },
    });

    revalidatePath('/admin/workflows');
    return { ok: true, message: `${existing.name} saved. Applies to requests submitted from now on.` };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

const policySchema = z.object({
  policyId: z.string().uuid(),
  threshold: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
  severity: z.enum(['WARNING', 'BLOCKING']),
  message: z.string().trim().min(10).max(400),
  isActive: z.coerce.boolean(),
});

export async function savePolicyAction(raw: unknown): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.policy');

    const parsed = policySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the policy values.' };

    const db = await ready();
    const [existing] = await db.select().from(policies).where(eq(policies.id, parsed.data.policyId)).limit(1);
    if (!existing) return { ok: false, message: 'Policy not found.' };

    await db
      .update(policies)
      .set({
        threshold: parsed.data.threshold == null ? existing.threshold : String(parsed.data.threshold),
        severity: parsed.data.severity,
        message: parsed.data.message,
        isActive: parsed.data.isActive,
      })
      .where(eq(policies.id, parsed.data.policyId));

    await recordAudit(db, {
      action: 'POLICY_CHANGE',
      entityType: 'policy',
      entityId: existing.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${existing.name} updated`,
      metadata: {
        before: { threshold: existing.threshold, severity: existing.severity, isActive: existing.isActive },
        after: { threshold: parsed.data.threshold, severity: parsed.data.severity, isActive: parsed.data.isActive },
      },
    });

    revalidatePath('/admin/policies');
    return { ok: true, message: `${existing.name} saved.` };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Users and roles                                                     */
/* ------------------------------------------------------------------ */

const roleSchema = z.object({
  userId: z.string().uuid(),
  primaryRole: z.enum(ROLES),
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
});

export async function saveUserRolesAction(raw: unknown): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.users');

    const parsed = roleSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: 'Select at least one role.' };
    const { userId, primaryRole, roles } = parsed.data;

    const db = await ready();
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, message: 'User not found.' };

    // Guard against an admin removing the last administrator and locking everyone out.
    if (!roles.includes('SUPER_ADMIN') && !roles.includes('ADMIN')) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(userRoles)
        .where(and(sql`${userRoles.role} in ('SUPER_ADMIN','ADMIN')`, sql`${userRoles.userId} <> ${userId}`));
      if (Number(n) === 0) {
        return { ok: false, message: 'This is the last account with administrator access — its admin role cannot be removed.' };
      }
    }

    const before = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));

    await db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values([...new Set([...roles, primaryRole])].map((role) => ({ userId, role })));
      await tx.update(users).set({ primaryRole }).where(eq(users.id, userId));
    });

    await recordAudit(db, {
      action: 'ROLE_CHANGE',
      entityType: 'user',
      entityId: userId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Roles for ${target.email} changed to ${roles.join(', ')}`,
      metadata: { before: before.map((b) => b.role), after: roles, primaryRole },
    });

    revalidatePath('/admin/users');
    return { ok: true, message: `Roles updated for ${target.email}. Takes effect on their next page load.` };
  } catch (err) {
    return fail(err);
  }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.users');

    const db = await ready();
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, message: 'User not found.' };
    if (target.id === session.userId && !isActive) {
      return { ok: false, message: 'You cannot deactivate your own account.' };
    }

    await db.update(users).set({ isActive }).where(eq(users.id, userId));
    await recordAudit(db, {
      action: 'ROLE_CHANGE',
      entityType: 'user',
      entityId: userId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${target.email} ${isActive ? 'activated' : 'deactivated'}`,
    });

    revalidatePath('/admin/users');
    return { ok: true, message: `${target.email} ${isActive ? 'can now sign in' : 'can no longer sign in'}.` };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function saveSettingAction(key: string, value: string): Promise<AdminResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.settings');

    const db = await ready();
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    if (!existing) return { ok: false, message: 'Unknown setting.' };

    // Preserve the stored JSON type: a number stays a number, a boolean a boolean.
    let parsed: unknown = value;
    if (typeof existing.value === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, message: 'This setting expects a number.' };
      parsed = n;
    } else if (typeof existing.value === 'boolean') {
      parsed = value === 'true';
    }

    await db.update(systemSettings).set({ value: parsed, updatedAt: new Date() }).where(eq(systemSettings.key, key));
    await recordAudit(db, {
      action: 'SETTING_CHANGE',
      entityType: 'system_setting',
      entityId: key,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${key} changed`,
      metadata: { before: existing.value, after: parsed },
    });

    revalidatePath('/admin/settings');
    return { ok: true, message: `${key} saved.` };
  } catch (err) {
    return fail(err);
  }
}
