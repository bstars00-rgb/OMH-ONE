'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { assertCan, PermissionError } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import {
  approvalLines,
  budgets,
  costCenters,
  departments,
  employees,
  formTemplates,
  holidays,
  offices,
  requests,
  teams,
} from '@/lib/db/schema';
import { recordAudit } from '@/server/audit';
import { getT } from '@/lib/i18n/server';
import type { Vars } from '@/lib/i18n/types';
import {
  ROUTING_DEPT_CODES,
  costCenterSchema,
  departmentSchema,
  officeSchema,
  teamSchema,
} from '@/lib/validation/organization';

export interface OrgResult {
  ok: boolean;
  /** Already translated — only the server can read the locale cookie. */
  message: string;
}

async function say(ok: boolean, key: string, vars?: Vars): Promise<OrgResult> {
  const t = await getT();
  return { ok, message: t(key, vars) };
}

async function fail(err: unknown): Promise<OrgResult> {
  if (err instanceof PermissionError) return say(false, err.message, err.vars);
  // A foreign-key violation means something still points at the row that the
  // explicit dependency check below did not enumerate. Report it rather than
  // showing a 500: the answer is the same either way — the row is in use.
  const code = (err as { code?: string })?.code;
  if (code === '23503') return say(false, 'org.inUseGeneric');
  if (code === '23505') return say(false, 'org.codeTaken');
  console.error('[organization] action failed', err);
  return say(false, 'org.saveFailed');
}

/* ------------------------------------------------------------------ */
/* Dependency guard                                                    */
/* ------------------------------------------------------------------ */

const N = { n: sql<number>`count(*)::int` };

/** A dependency count, paired with the word the message uses for it. */
interface Check {
  label: string;
  rows: PromiseLike<{ n: number }[]>;
}

/**
 * What still points at this row, as counts the user recognises.
 *
 * Deleting an office that 40 people belong to is not a decision to make from a
 * confirm dialog, so a row that anything references cannot be deleted; the
 * message names what is attached so the admin knows what to move first.
 *
 * The counts are written as ordinary Drizzle selects rather than table names in
 * strings, so a renamed column fails the build instead of silently counting
 * zero and letting the delete through.
 *
 * Cost centers are the exception — they carry an `active` flag, so the honest
 * action for one with history is to deactivate it, which the UI offers instead.
 */
async function firstBlocker(checks: Check[]): Promise<{ label: string; count: number } | null> {
  const counts = await Promise.all(checks.map((c) => c.rows));
  for (const [i, rows] of counts.entries()) {
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) return { label: checks[i].label, count: n };
  }
  return null;
}

/** Renders the blocker into the caller's language. */
async function blocked(key: string, name: string, blocker: { label: string; count: number }): Promise<OrgResult> {
  const t = await getT();
  return say(false, key, { name, what: t(blocker.label), count: blocker.count });
}

/* ------------------------------------------------------------------ */
/* Offices                                                             */
/* ------------------------------------------------------------------ */

export async function saveOfficeAction(raw: unknown): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const parsed = officeSchema.safeParse(raw);
    if (!parsed.success) return say(false, parsed.error.issues[0]?.message ?? 'org.checkValues');
    const { id, code, name, country, city, timezone, baseCurrency } = parsed.data;

    const db = await ready();
    const clash = await db
      .select({ id: offices.id })
      .from(offices)
      .where(id ? and(eq(offices.code, code), ne(offices.id, id)) : eq(offices.code, code))
      .limit(1);
    if (clash.length > 0) return say(false, 'org.codeTaken', { code });

    if (id) {
      const [before] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
      if (!before) return say(false, 'org.notFound');
      // The code is the join key for seeded data and reports, so it is set once.
      await db.update(offices).set({ name, country, city, timezone, baseCurrency }).where(eq(offices.id, id));
      await recordAudit(db, {
        action: 'EDIT',
        entityType: 'office',
        entityId: before.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Office ${before.code} updated`,
        metadata: { before: { name: before.name, city: before.city, timezone: before.timezone }, after: { name, city, timezone } },
      });
    } else {
      const [created] = await db.insert(offices).values({ code, name, country, city, timezone, baseCurrency }).returning();
      await recordAudit(db, {
        action: 'CREATE',
        entityType: 'office',
        entityId: created.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Office ${code} created`,
        metadata: { name, country, city, timezone, baseCurrency },
      });
    }

    revalidatePath('/admin/organization');
    return say(true, id ? 'org.officeSaved' : 'org.officeCreated', { name });
  } catch (err) {
    return await fail(err);
  }
}

export async function deleteOfficeAction(id: string): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const db = await ready();
    const [target] = await db.select().from(offices).where(eq(offices.id, id)).limit(1);
    if (!target) return say(false, 'org.notFound');

    // form_templates and approval_lines cascade at the database level. That is
    // right when an office really is being removed, but it would delete work
    // nobody asked about, so they block the delete like everything else.
    const blocker = await firstBlocker([
      { label: 'org.depEmployees', rows: db.select(N).from(employees).where(eq(employees.officeId, id)) },
      { label: 'org.depDepartments', rows: db.select(N).from(departments).where(eq(departments.officeId, id)) },
      { label: 'org.depRequests', rows: db.select(N).from(requests).where(eq(requests.officeId, id)) },
      { label: 'org.depHolidays', rows: db.select(N).from(holidays).where(eq(holidays.officeId, id)) },
      { label: 'org.depTemplates', rows: db.select(N).from(formTemplates).where(eq(formTemplates.officeId, id)) },
      { label: 'org.depLines', rows: db.select(N).from(approvalLines).where(eq(approvalLines.officeId, id)) },
    ]);
    if (blocker) return await blocked('org.inUse', target.name, blocker);

    await db.delete(offices).where(eq(offices.id, id));
    await recordAudit(db, {
      action: 'DELETE',
      entityType: 'office',
      entityId: target.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Office ${target.code} deleted`,
      metadata: { name: target.name, city: target.city },
    });

    revalidatePath('/admin/organization');
    return say(true, 'org.officeDeleted', { name: target.name });
  } catch (err) {
    return await fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

export async function saveDepartmentAction(raw: unknown): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const parsed = departmentSchema.safeParse(raw);
    if (!parsed.success) return say(false, parsed.error.issues[0]?.message ?? 'org.checkValues');
    const { id, code, name, officeId, headEmployeeId } = parsed.data;

    const db = await ready();
    const clash = await db
      .select({ id: departments.id })
      .from(departments)
      .where(id ? and(eq(departments.code, code), ne(departments.id, id)) : eq(departments.code, code))
      .limit(1);
    if (clash.length > 0) return say(false, 'org.codeTaken', { code });

    // The head is the person the HR / Finance / Director steps resolve to, so a
    // name that is not a real active employee would break routing silently.
    if (headEmployeeId) {
      const [head] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, headEmployeeId), eq(employees.status, 'ACTIVE')))
        .limit(1);
      if (!head) return say(false, 'org.headNotEmployee');
    }

    if (id) {
      const [before] = await db
        .select({ code: departments.code, name: departments.name, headEmployeeId: departments.headEmployeeId })
        .from(departments)
        .where(eq(departments.id, id))
        .limit(1);
      if (!before) return say(false, 'org.notFound');

      await db.update(departments).set({ name, officeId, headEmployeeId: headEmployeeId ?? null }).where(eq(departments.id, id));

      // A head change re-routes every future approval that resolves this
      // department, which is exactly the kind of change an auditor looks for.
      const headChanged = (before.headEmployeeId ?? null) !== (headEmployeeId ?? null);
      await recordAudit(db, {
        action: 'EDIT',
        entityType: 'department',
        entityId: before.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: headChanged ? `Department ${before.code} head changed` : `Department ${before.code} updated`,
        metadata: { before: { name: before.name, head: before.headEmployeeId }, after: { name, head: headEmployeeId ?? null }, headChanged },
      });
    } else {
      const [created] = await db
        .insert(departments)
        .values({ code, name, officeId, headEmployeeId: headEmployeeId ?? null })
        .returning();
      await recordAudit(db, {
        action: 'CREATE',
        entityType: 'department',
        entityId: created.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Department ${code} created`,
        metadata: { name, officeId, head: headEmployeeId ?? null },
      });
    }

    revalidatePath('/admin/organization');
    return say(true, id ? 'org.deptSaved' : 'org.deptCreated', { name });
  } catch (err) {
    return await fail(err);
  }
}

export async function deleteDepartmentAction(id: string): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const db = await ready();
    const [target] = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
    if (!target) return say(false, 'org.notFound');

    // HR / FIN / CEO are how the approval engine finds those approvers. Deleting
    // one would not fail loudly — requests would simply route to nobody.
    if ((ROUTING_DEPT_CODES as readonly string[]).includes(target.code)) {
      return say(false, 'org.routingDept', { code: target.code });
    }

    const blocker = await firstBlocker([
      { label: 'org.depEmployees', rows: db.select(N).from(employees).where(eq(employees.departmentId, id)) },
      { label: 'org.depTeams', rows: db.select(N).from(teams).where(eq(teams.departmentId, id)) },
      { label: 'org.depCostCenters', rows: db.select(N).from(costCenters).where(eq(costCenters.departmentId, id)) },
      { label: 'org.depRequests', rows: db.select(N).from(requests).where(eq(requests.departmentId, id)) },
      { label: 'org.depBudgets', rows: db.select(N).from(budgets).where(eq(budgets.departmentId, id)) },
    ]);
    if (blocker) return await blocked('org.inUse', target.name, blocker);

    await db.delete(departments).where(eq(departments.id, id));
    await recordAudit(db, {
      action: 'DELETE',
      entityType: 'department',
      entityId: target.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Department ${target.code} deleted`,
      metadata: { name: target.name },
    });

    revalidatePath('/admin/organization');
    return say(true, 'org.deptDeleted', { name: target.name });
  } catch (err) {
    return await fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

export async function saveTeamAction(raw: unknown): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const parsed = teamSchema.safeParse(raw);
    if (!parsed.success) return say(false, parsed.error.issues[0]?.message ?? 'org.checkValues');
    const { id, code, name, departmentId } = parsed.data;

    const db = await ready();
    const clash = await db
      .select({ id: teams.id })
      .from(teams)
      .where(id ? and(eq(teams.code, code), ne(teams.id, id)) : eq(teams.code, code))
      .limit(1);
    if (clash.length > 0) return say(false, 'org.codeTaken', { code });

    if (id) {
      const [before] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
      if (!before) return say(false, 'org.notFound');
      await db.update(teams).set({ name, departmentId }).where(eq(teams.id, id));
      await recordAudit(db, {
        action: 'EDIT',
        entityType: 'team',
        entityId: before.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Team ${before.code} updated`,
        metadata: { before: { name: before.name, departmentId: before.departmentId }, after: { name, departmentId } },
      });
    } else {
      const [created] = await db.insert(teams).values({ code, name, departmentId }).returning();
      await recordAudit(db, {
        action: 'CREATE',
        entityType: 'team',
        entityId: created.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Team ${code} created`,
        metadata: { name, departmentId },
      });
    }

    revalidatePath('/admin/organization');
    return say(true, id ? 'org.teamSaved' : 'org.teamCreated', { name });
  } catch (err) {
    return await fail(err);
  }
}

export async function deleteTeamAction(id: string): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const db = await ready();
    const [target] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!target) return say(false, 'org.notFound');

    const blocker = await firstBlocker([
      { label: 'org.depEmployees', rows: db.select(N).from(employees).where(eq(employees.teamId, id)) },
    ]);
    if (blocker) return await blocked('org.inUse', target.name, blocker);

    await db.delete(teams).where(eq(teams.id, id));
    await recordAudit(db, {
      action: 'DELETE',
      entityType: 'team',
      entityId: target.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Team ${target.code} deleted`,
      metadata: { name: target.name },
    });

    revalidatePath('/admin/organization');
    return say(true, 'org.teamDeleted', { name: target.name });
  } catch (err) {
    return await fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Cost centers                                                        */
/* ------------------------------------------------------------------ */

export async function saveCostCenterAction(raw: unknown): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const parsed = costCenterSchema.safeParse(raw);
    if (!parsed.success) return say(false, parsed.error.issues[0]?.message ?? 'org.checkValues');
    const { id, code, name, departmentId, active } = parsed.data;

    const db = await ready();
    const clash = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(id ? and(eq(costCenters.code, code), ne(costCenters.id, id)) : eq(costCenters.code, code))
      .limit(1);
    if (clash.length > 0) return say(false, 'org.codeTaken', { code });

    if (id) {
      const [before] = await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1);
      if (!before) return say(false, 'org.notFound');
      await db.update(costCenters).set({ name, departmentId: departmentId ?? null, active }).where(eq(costCenters.id, id));
      await recordAudit(db, {
        action: 'EDIT',
        entityType: 'cost_center',
        entityId: before.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Cost center ${before.code} updated`,
        metadata: { before: { name: before.name, active: before.active }, after: { name, active } },
      });
    } else {
      const [created] = await db
        .insert(costCenters)
        .values({ code, name, departmentId: departmentId ?? null, active })
        .returning();
      await recordAudit(db, {
        action: 'CREATE',
        entityType: 'cost_center',
        entityId: created.code,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Cost center ${code} created`,
        metadata: { name, departmentId: departmentId ?? null },
      });
    }

    revalidatePath('/admin/organization');
    return say(true, id ? 'org.ccSaved' : 'org.ccCreated', { name });
  } catch (err) {
    return await fail(err);
  }
}

/**
 * Cost centers are deactivated, not deleted, once anything has been booked to
 * them: budgets and past requests refer to them and a report has to stay
 * readable. Deletion stays available only while the code is still unused.
 */
export async function deleteCostCenterAction(id: string): Promise<OrgResult> {
  try {
    const session = await requireSession();
    assertCan(session, 'admin.organization');

    const db = await ready();
    const [target] = await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1);
    if (!target) return say(false, 'org.notFound');

    const blocker = await firstBlocker([
      { label: 'org.depRequests', rows: db.select(N).from(requests).where(eq(requests.costCenterId, id)) },
      { label: 'org.depBudgets', rows: db.select(N).from(budgets).where(eq(budgets.costCenterId, id)) },
    ]);
    if (blocker) return await blocked('org.ccInUse', target.name, blocker);

    await db.delete(costCenters).where(eq(costCenters.id, id));
    await recordAudit(db, {
      action: 'DELETE',
      entityType: 'cost_center',
      entityId: target.code,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `Cost center ${target.code} deleted`,
      metadata: { name: target.name },
    });

    revalidatePath('/admin/organization');
    return say(true, 'org.ccDeleted', { name: target.name });
  } catch (err) {
    return await fail(err);
  }
}
