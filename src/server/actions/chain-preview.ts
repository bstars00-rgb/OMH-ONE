'use server';

import { and, asc, eq, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { assertCan } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import {
  approvalWorkflowSteps,
  approvalWorkflows,
  departments,
  employees,
  formTemplates,
} from '@/lib/db/schema';
import { materializeSteps, type ApproverDirectory } from '@/lib/workflow/engine';
import { getI18n } from '@/lib/i18n/server';
import { EXECUTIVE_SETTING_KEYS } from '@/types/domain';
import { systemSettings } from '@/lib/db/schema';

export interface ChainStep {
  order: number;
  name: string;
  role: string;
  approverId: string | null;
  approverName: string;
  approverPosition: string | null;
  slaHours: number;
  addedByRequester: boolean;
}

export interface ChainPreview {
  ok: boolean;
  message?: string;
  steps: ChainStep[];
}

/**
 * Resolves the approval chain a request *would* get, without writing anything.
 *
 * Shown before submitting so the requester sees who will decide, and can add a
 * reviewer if the derived route misses someone — a second pair of eyes on an
 * unusual request, say. The derived steps stay fixed: the requester may make
 * their request harder to approve, never easier.
 *
 * Deliberately duplicates none of the resolution logic — it calls the same
 * `materializeSteps` the real submission does, so the preview cannot drift from
 * what actually happens.
 */
export async function previewChainAction(input: {
  requestType: string;
  templateId?: string | null;
  amountBase?: number;
  days?: number;
  isInternational?: boolean;
  quotationCount?: number;
}): Promise<ChainPreview> {
  try {
    const session = await requireSession();
    assertCan(session, 'request.create');
    const { t } = await getI18n();

    const db = await ready();

    /* --- which workflow --- */
    let workflowId: string | null = null;
    if (input.templateId) {
      const [tpl] = await db
        .select({ workflowId: formTemplates.workflowId })
        .from(formTemplates)
        .where(eq(formTemplates.id, input.templateId))
        .limit(1);
      if (tpl?.workflowId) {
        const [named] = await db
          .select({ id: approvalWorkflows.id })
          .from(approvalWorkflows)
          .where(and(eq(approvalWorkflows.id, tpl.workflowId), eq(approvalWorkflows.isActive, true)))
          .limit(1);
        workflowId = named?.id ?? null;
      }
    }
    if (!workflowId) {
      const [byType] = await db
        .select({ id: approvalWorkflows.id })
        .from(approvalWorkflows)
        .where(and(eq(approvalWorkflows.requestType, input.requestType), eq(approvalWorkflows.isActive, true)))
        .orderBy(sql`${approvalWorkflows.isDefault} desc`)
        .limit(1);
      workflowId = byType?.id ?? null;
    }
    if (!workflowId) return { ok: false, message: t('wfError.noWorkflow'), steps: [] };

    const templates = await db
      .select()
      .from(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.workflowId, workflowId))
      .orderBy(asc(approvalWorkflowSteps.stepOrder));

    /* --- who fills each role --- */
    const dir = await directoryFor(db, session.employeeId);

    const auto = materializeSteps(
      templates.map((s) => ({
        stepOrder: s.stepOrder,
        name: s.name,
        approverRole: s.approverRole,
        approverEmployeeId: s.approverEmployeeId,
        slaHours: s.slaHours,
        conditionType: s.conditionType,
        conditionValue: s.conditionValue,
      })),
      {
        amountBase: input.amountBase ?? 0,
        isInternational: input.isInternational ?? false,
        days: input.days ?? 0,
        quotationCount: input.quotationCount ?? 0,
      },
      dir,
    );

    const chain = auto;
    if (chain.length === 0) return { ok: false, message: t('wfError.noApprover'), steps: [] };

    /* --- names for display --- */
    const ids = chain.map((s) => s.approverId).filter(Boolean) as string[];
    const people = ids.length
      ? await db
          .select({ id: employees.id, name: employees.name, position: employees.position })
          .from(employees)
          .where(sql`${employees.id} in ${ids}`)
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    return {
      ok: true,
      steps: chain.map((s) => ({
        order: s.stepOrder,
        name: s.name,
        role: s.approverRole,
        approverId: s.approverId,
        approverName: (s.approverId && byId.get(s.approverId)?.name) || t('org.headNotSet'),
        approverPosition: (s.approverId && byId.get(s.approverId)?.position) || null,
        slaHours: s.slaHours,
        addedByRequester: s.addedByRequester ?? false,
      })),
    };
  } catch (err) {
    console.error('[chain] preview failed', err);
    const { t } = await getI18n();
    return { ok: false, message: t('chain.previewFailed'), steps: [] };
  }
}

/** Same resolution the submit path uses, read outside a transaction. */
async function directoryFor(
  db: Awaited<ReturnType<typeof ready>>,
  requesterId: string,
): Promise<ApproverDirectory> {
  const [requester] = await db
    .select({ id: employees.id, managerId: employees.managerId, departmentId: employees.departmentId })
    .from(employees)
    .where(eq(employees.id, requesterId))
    .limit(1);

  const [dept] = requester?.departmentId
    ? await db
        .select({ head: departments.headEmployeeId })
        .from(departments)
        .where(eq(departments.id, requester.departmentId))
        .limit(1)
    : [undefined];

  const roleHolder = async (code: string) => {
    const [row] = await db
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(departments.code, code), eq(employees.id, departments.headEmployeeId)))
      .limit(1);
    return row?.id ?? null;
  };

  const setting = async (key: string) => {
    const [row] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    const code = typeof row?.value === 'string' ? row.value : null;
    if (!code) return null;
    const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, code)).limit(1);
    return emp?.id ?? null;
  };

  const [hrId, financeId, directorId, ctoId, ceoId] = await Promise.all([
    roleHolder('HR'),
    roleHolder('FIN'),
    roleHolder('CEO'),
    setting(EXECUTIVE_SETTING_KEYS.CTO ?? 'approver.CTO'),
    setting(EXECUTIVE_SETTING_KEYS.CEO ?? 'approver.CEO'),
  ]);

  return {
    requesterId,
    managerId: requester?.managerId ?? null,
    deptHeadId: dept?.head ?? null,
    hrId,
    financeId,
    directorId,
    ctoId,
    ceoId: ceoId ?? directorId,
  };
}
