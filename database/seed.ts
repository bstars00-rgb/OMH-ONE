/**
 * Demo dataset generator.
 *
 * Runs automatically on first boot (see src/lib/db/bootstrap.ts) or manually via
 * `npm run db:seed`. Everything is derived from a fixed PRNG seed and from
 * "today", so the dashboards always show a live-looking 12-month trend and the
 * same run produces the same data twice.
 *
 * The generator deliberately builds requests through the real approval engine
 * (`materializeSteps`) rather than fabricating approval rows, so seeded history
 * is indistinguishable from history the app itself produced.
 */
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  approvalActions,
  approvalSteps,
  approvalWorkflows,
  approvalWorkflowSteps,
  attachments,
  auditLogs,
  budgets,
  businessTrips,
  comments,
  costCenters,
  departments,
  employees,
  exchangeRates,
  expenseClaims,
  expenseItems,
  genericRequests,
  holidays,
  leaveBalances,
  leaveRequests,
  notifications,
  offices,
  policies,
  purchaseItems,
  purchaseRequests,
  requests,
  systemSettings,
  teams,
  tripCosts,
  tripTravelers,
  userRoles,
  users,
  vendors,
  formTemplates,
  approvalLines,
  approvalLineMembers,
} from '../src/lib/db/schema';
import type { Database } from '../src/lib/db';
import { FORM_TEMPLATES } from './template-data';
import { hashPassword } from '../src/lib/auth/password';
import { materializeSteps, scorePriority, type RequestFacts } from '../src/lib/workflow/engine';
import { calcWorkingDays, toISODate, addDays, daysBetween } from '../src/lib/dates';
import { REFERENCE_RATES, round2 } from '../src/lib/money';
import { REQUEST_TYPE_META } from '../src/types/domain';
import {
  COST_CENTERS,
  DEPARTMENTS,
  EMPLOYEES,
  EXPENSE_MERCHANTS,
  GENERAL_REQUEST_KINDS,
  HOLIDAY_TEMPLATE,
  HR_REQUEST_KINDS,
  OFFICES,
  POLICIES,
  PURCHASE_ITEMS_POOL,
  TEAMS,
  TRIP_DESTINATIONS,
  TRIP_PURPOSES,
  VENDORS,
  WORKFLOWS,
} from './seed-data';

export const DEMO_PASSWORD = 'demo1234';

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260814);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const pickMany = <T>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(...copy.splice(Math.floor(rand() * copy.length), 1));
  return out;
};
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (p: number) => rand() < p;

const NOW = new Date();
const ago = (days: number, hourOffset = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 + hourOffset * 3_600_000);

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export async function seed(db: Database) {
  const log = (m: string) => console.log(`  [seed] ${m}`);

  /* -------- Organization -------- */
  const officeIds = new Map<string, string>();
  await db.insert(offices).values(
    OFFICES.map((o) => {
      const id = randomUUID();
      officeIds.set(o.code, id);
      return { id, ...o };
    }),
  );

  const deptIds = new Map<string, string>();
  await db.insert(departments).values(
    DEPARTMENTS.map((d) => {
      const id = randomUUID();
      deptIds.set(d.code, id);
      return { id, code: d.code, name: d.name, officeId: officeIds.get(d.office)! };
    }),
  );

  const teamIds = new Map<string, string>();
  await db.insert(teams).values(
    TEAMS.map((t) => {
      const id = randomUUID();
      teamIds.set(t.code, id);
      return { id, code: t.code, name: t.name, departmentId: deptIds.get(t.department)! };
    }),
  );

  const ccIds = new Map<string, string>();
  await db.insert(costCenters).values(
    COST_CENTERS.map((c) => {
      const id = randomUUID();
      ccIds.set(c.code, id);
      return { id, code: c.code, name: c.name, departmentId: deptIds.get(c.department)! };
    }),
  );
  log(`offices ${OFFICES.length}, departments ${DEPARTMENTS.length}, teams ${TEAMS.length}`);

  /* -------- People -------- */
  const empIds = new Map<string, string>();
  for (const e of EMPLOYEES) empIds.set(e.code, randomUUID());

  await db.insert(employees).values(
    EMPLOYEES.map((e) => ({
      id: empIds.get(e.code)!,
      employeeCode: e.code,
      name: e.name,
      englishName: e.englishName ?? e.name,
      email: e.email,
      departmentId: deptIds.get(e.department)!,
      teamId: e.team ? teamIds.get(e.team)! : null,
      officeId: officeIds.get(e.office)!,
      position: e.position,
      managerId: e.managerCode ? empIds.get(e.managerCode)! : null,
      employmentType: 'FULL_TIME',
      joinDate: e.joinDate,
      status: 'ACTIVE',
      annualLeaveAllowance: e.allowance.toFixed(1),
    })),
  );

  // Department heads (self-referencing, so set after employees exist).
  const { eq } = await import('drizzle-orm');
  for (const e of EMPLOYEES.filter((x) => x.isDeptHead)) {
    await db
      .update(departments)
      .set({ headEmployeeId: empIds.get(e.code)! })
      .where(eq(departments.code, e.department));
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, string>();
  await db.insert(users).values(
    EMPLOYEES.map((e) => {
      const id = randomUUID();
      userIds.set(e.code, id);
      return {
        id,
        email: e.email,
        passwordHash,
        employeeId: empIds.get(e.code)!,
        primaryRole: e.primaryRole ?? 'EMPLOYEE',
        isActive: true,
      };
    }),
  );
  await db.insert(userRoles).values(
    EMPLOYEES.flatMap((e) => {
      const roles = new Set(e.roles ?? []);
      roles.add(e.primaryRole ?? 'EMPLOYEE');
      return [...roles].map((role) => ({ userId: userIds.get(e.code)!, role }));
    }),
  );
  log(`employees ${EMPLOYEES.length}, user accounts ${EMPLOYEES.length}`);

  /* -------- Calendar & FX -------- */
  const years = [NOW.getUTCFullYear() - 1, NOW.getUTCFullYear(), NOW.getUTCFullYear() + 1];
  await db.insert(holidays).values(
    years.flatMap((y) =>
      HOLIDAY_TEMPLATE.map((h) => ({
        id: randomUUID(),
        officeId: h.office ? officeIds.get(h.office)! : null,
        holidayDate: `${y}-${h.md}`,
        name: h.name,
      })),
    ),
  );

  const rateRows: (typeof exchangeRates.$inferInsert)[] = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - m, 1));
    for (const [cur, base] of Object.entries(REFERENCE_RATES)) {
      if (cur === 'USD') continue;
      // Small deterministic drift so the FX table is not a flat line.
      const drift = 1 + (rand() - 0.5) * 0.04;
      rateRows.push({
        id: randomUUID(),
        baseCurrency: 'USD',
        quoteCurrency: cur,
        rate: (base * drift).toFixed(8),
        effectiveDate: toISODate(d),
      });
    }
  }
  await db.insert(exchangeRates).values(rateRows);

  /* -------- Vendors, workflows, policies -------- */
  const vendorIds = new Map<string, string>();
  await db.insert(vendors).values(
    VENDORS.map((v) => {
      const id = randomUUID();
      vendorIds.set(v.code, id);
      return { id, ...v, active: true };
    }),
  );

  const workflowIds = new Map<string, string>();
  const workflowSteps = new Map<string, (typeof approvalWorkflowSteps.$inferInsert)[]>();
  for (const wf of WORKFLOWS) {
    const id = randomUUID();
    workflowIds.set(wf.requestType, id);
    await db.insert(approvalWorkflows).values({
      id,
      name: wf.name,
      requestType: wf.requestType,
      description: wf.description,
      isActive: true,
      isDefault: true,
    });
    const steps = wf.steps.map((s, i) => ({
      id: randomUUID(),
      workflowId: id,
      stepOrder: i + 1,
      name: s.name,
      approverRole: s.approverRole,
      slaHours: s.slaHours,
      conditionType: s.conditionType,
      conditionValue: 'conditionValue' in s && s.conditionValue != null ? String(s.conditionValue) : null,
    }));
    await db.insert(approvalWorkflowSteps).values(steps);
    workflowSteps.set(wf.requestType, steps);
  }

  await db.insert(policies).values(
    POLICIES.map((p) => ({
      id: randomUUID(),
      code: p.code,
      name: p.name,
      appliesTo: p.appliesTo,
      metric: p.metric,
      operator: p.operator,
      threshold: 'threshold' in p && p.threshold != null ? String(p.threshold) : null,
      thresholdText: 'thresholdText' in p ? (p.thresholdText as string) : null,
      currency: 'USD',
      severity: p.severity,
      message: p.message,
      isActive: true,
    })),
  );
  log(`vendors ${VENDORS.length}, workflows ${WORKFLOWS.length}, policies ${POLICIES.length}`);

  /* -------- Budgets -------- */
  const year = NOW.getUTCFullYear();
  const quarter = Math.floor(NOW.getUTCMonth() / 3) + 1;
  const BUDGET_PLAN: Record<string, { TRAVEL: number; PROCUREMENT: number; OPERATING: number }> = {
    CEO: { TRAVEL: 24000, PROCUREMENT: 9000, OPERATING: 12000 },
    SCM: { TRAVEL: 38000, PROCUREMENT: 22000, OPERATING: 14000 },
    GSM: { TRAVEL: 30000, PROCUREMENT: 26000, OPERATING: 12000 },
    OP: { TRAVEL: 14000, PROCUREMENT: 18000, OPERATING: 16000 },
    CT: { TRAVEL: 16000, PROCUREMENT: 20000, OPERATING: 11000 },
    IT: { TRAVEL: 9000, PROCUREMENT: 46000, OPERATING: 10000 },
    FIN: { TRAVEL: 7000, PROCUREMENT: 8000, OPERATING: 9000 },
    HR: { TRAVEL: 8000, PROCUREMENT: 9000, OPERATING: 10000 },
  };
  const budgetIds = new Map<string, string>(); // `${dept}:${category}`
  const budgetRows: (typeof budgets.$inferInsert)[] = [];
  for (const [dept, plan] of Object.entries(BUDGET_PLAN)) {
    for (const [category, annual] of Object.entries(plan)) {
      // Quarterly slice of the annual allocation.
      const id = randomUUID();
      budgetIds.set(`${dept}:${category}`, id);
      budgetRows.push({
        id,
        year,
        quarter,
        departmentId: deptIds.get(dept)!,
        costCenterId: ccIds.get(`CC-${dept}`)!,
        category,
        allocated: (annual / 4).toFixed(2),
        committed: '0',
        spent: '0',
        currency: 'USD',
      });
    }
  }
  await db.insert(budgets).values(budgetRows);

  /* -------- Leave balances -------- */
  const balanceRows: (typeof leaveBalances.$inferInsert)[] = [];
  for (const e of EMPLOYEES) {
    balanceRows.push({
      id: randomUUID(),
      employeeId: empIds.get(e.code)!,
      year,
      leaveType: 'ANNUAL',
      allowance: e.allowance.toFixed(1),
      used: '0',
      pending: '0',
      carriedOver: chance(0.3) ? intBetween(1, 3).toFixed(1) : '0',
    });
    balanceRows.push({
      id: randomUUID(),
      employeeId: empIds.get(e.code)!,
      year,
      leaveType: 'SICK',
      allowance: '10.0',
      used: '0',
      pending: '0',
      carriedOver: '0',
    });
  }
  await db.insert(leaveBalances).values(balanceRows);

  /* ---------------------------------------------------------------- */
  /* Requests                                                          */
  /* ---------------------------------------------------------------- */

  const holidayList = HOLIDAY_TEMPLATE.flatMap((h) =>
    years.map((y) => ({ holidayDate: `${y}-${h.md}`, name: h.name })),
  );

  const byCode = new Map(EMPLOYEES.map((e) => [e.code, e]));
  const deptHeadOf = new Map(EMPLOYEES.filter((e) => e.isDeptHead).map((e) => [e.department, e.code]));
  const DIRECTOR = 'E001';
  const HR_APPROVER = 'E070';
  const FINANCE_APPROVER = 'E060';
  const CTO = 'E050';

  const counters = new Map<string, number>();
  function nextNumber(type: keyof typeof REQUEST_TYPE_META) {
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);
    return `${REQUEST_TYPE_META[type].prefix}-${year}-${String(n).padStart(5, '0')}`;
  }

  // Accumulators, flushed in one batch per table at the end.
  const requestRows: (typeof requests.$inferInsert)[] = [];
  const stepRows: (typeof approvalSteps.$inferInsert)[] = [];
  const actionRows: (typeof approvalActions.$inferInsert)[] = [];
  const commentRows: (typeof comments.$inferInsert)[] = [];
  const attachmentRows: (typeof attachments.$inferInsert)[] = [];
  const notificationRows: (typeof notifications.$inferInsert)[] = [];
  const auditRows: (typeof auditLogs.$inferInsert)[] = [];
  const leaveRows: (typeof leaveRequests.$inferInsert)[] = [];
  const tripRows: (typeof businessTrips.$inferInsert)[] = [];
  const travelerRows: (typeof tripTravelers.$inferInsert)[] = [];
  const tripCostRows: (typeof tripCosts.$inferInsert)[] = [];
  const prRows: (typeof purchaseRequests.$inferInsert)[] = [];
  const prItemRows: (typeof purchaseItems.$inferInsert)[] = [];
  const claimRows: (typeof expenseClaims.$inferInsert)[] = [];
  const claimItemRows: (typeof expenseItems.$inferInsert)[] = [];
  const genericRows: (typeof genericRequests.$inferInsert)[] = [];

  interface BuildArgs {
    type: keyof typeof REQUEST_TYPE_META;
    requesterCode: string;
    title: string;
    description: string;
    amountBase: number;
    facts: Partial<RequestFacts>;
    submittedDaysAgo: number;
    /** 'OPEN' leaves it mid-flight; the others close it out. */
    outcome: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELED' | 'DRAFT';
    /** For OPEN requests: how many steps are already approved. */
    stepsDone?: number;
    risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  }

  interface BuiltRequest {
    id: string;
    number: string;
    type: string;
    requesterCode: string;
    deptCode: string;
    amountBase: number;
    status: string;
    submittedAt: Date | null;
    decidedAt: Date | null;
    currentApproverCode: string | null;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
  }

  const built: BuiltRequest[] = [];

  function buildRequest(a: BuildArgs): BuiltRequest {
    const requester = byCode.get(a.requesterCode)!;
    const requestId = randomUUID();
    const number = nextNumber(a.type);
    const submittedAt = a.outcome === 'DRAFT' ? null : ago(a.submittedDaysAgo, intBetween(-6, 6));

    const facts: RequestFacts = {
      amountBase: a.amountBase,
      isInternational: a.facts.isInternational ?? false,
      days: a.facts.days ?? 0,
      quotationCount: a.facts.quotationCount ?? 0,
    };

    const deptHeadCode = deptHeadOf.get(requester.department) ?? null;
    const materialized = materializeSteps(
      (workflowSteps.get(a.type) ?? []).map((s) => ({
        stepOrder: s.stepOrder!,
        name: s.name!,
        approverRole: s.approverRole!,
        slaHours: s.slaHours ?? 24,
        conditionType: s.conditionType ?? 'ALWAYS',
        conditionValue: s.conditionValue ?? null,
      })),
      facts,
      {
        requesterId: a.requesterCode,
        managerId: requester.managerCode,
        deptHeadId: deptHeadCode,
        hrId: HR_APPROVER,
        financeId: FINANCE_APPROVER,
        directorId: DIRECTOR,
        ctoId: CTO,
        ceoId: DIRECTOR,
      },
    );

    const risk = a.risk ?? (a.amountBase > 3000 ? 'MEDIUM' : 'LOW');

    // Walk the chain and decide where it stopped.
    let status = 'DRAFT';
    let currentStepOrder = 0;
    let decidedAt: Date | null = null;
    let currentApproverCode: string | null = null;

    const totalSteps = materialized.length;
    let approvedCount: number;
    if (a.outcome === 'DRAFT') approvedCount = 0;
    else if (a.outcome === 'APPROVED') approvedCount = totalSteps;
    else if (a.outcome === 'OPEN') approvedCount = Math.min(a.stepsDone ?? 0, Math.max(0, totalSteps - 1));
    else approvedCount = Math.min(a.stepsDone ?? 0, Math.max(0, totalSteps - 1));

    if (a.outcome !== 'DRAFT') {
      actionRows.push({
        id: randomUUID(),
        requestId,
        stepId: null,
        approverId: empIds.get(a.requesterCode)!,
        action: 'SUBMIT',
        comment: null,
        actionAt: submittedAt!,
      });
    }

    let cursor = submittedAt ? new Date(submittedAt) : new Date();

    materialized.forEach((step, idx) => {
      const stepId = randomUUID();
      const isDone = idx < approvedCount;
      const isCurrent = idx === approvedCount && a.outcome !== 'DRAFT' && a.outcome !== 'APPROVED';
      const startedAt = a.outcome === 'DRAFT' ? null : new Date(cursor);
      const dueAt = startedAt ? new Date(startedAt.getTime() + step.slaHours * 3_600_000) : null;

      let stepStatus = 'PENDING';
      let completedAt: Date | null = null;

      if (isDone) {
        stepStatus = 'APPROVED';
        const turnaround = between(1.5, step.slaHours * 1.4);
        completedAt = new Date(cursor.getTime() + turnaround * 3_600_000);
        cursor = new Date(completedAt);
      } else if (a.outcome === 'APPROVED') {
        stepStatus = 'APPROVED';
        const turnaround = between(1.5, step.slaHours * 1.2);
        completedAt = new Date(cursor.getTime() + turnaround * 3_600_000);
        cursor = new Date(completedAt);
      } else if (isCurrent) {
        if (a.outcome === 'REJECTED') {
          stepStatus = 'REJECTED';
          completedAt = new Date(cursor.getTime() + between(2, 30) * 3_600_000);
          decidedAt = completedAt;
        } else if (a.outcome === 'RETURNED') {
          stepStatus = 'RETURNED';
          completedAt = new Date(cursor.getTime() + between(2, 20) * 3_600_000);
        } else if (a.outcome === 'CANCELED') {
          stepStatus = 'SKIPPED';
        } else {
          stepStatus = chance(0.45) ? 'IN_REVIEW' : 'PENDING';
          currentApproverCode = step.approverId;
          currentStepOrder = step.stepOrder;
        }
      } else if (a.outcome === 'CANCELED') {
        stepStatus = 'SKIPPED';
      }

      stepRows.push({
        id: stepId,
        requestId,
        stepOrder: step.stepOrder,
        name: step.name,
        approverRole: step.approverRole,
        approverId: empIds.get(step.approverId!)!,
        status: stepStatus,
        slaHours: step.slaHours,
        dueAt,
        startedAt,
        completedAt,
        createdAt: submittedAt ?? NOW,
      });

      if (completedAt && ['APPROVED', 'REJECTED', 'RETURNED'].includes(stepStatus)) {
        actionRows.push({
          id: randomUUID(),
          requestId,
          stepId,
          approverId: empIds.get(step.approverId!)!,
          action: stepStatus === 'APPROVED' ? 'APPROVE' : stepStatus === 'REJECTED' ? 'REJECT' : 'RETURN',
          comment:
            stepStatus === 'APPROVED'
              ? pick(['Approved.', 'Looks fine — approved.', 'OK, team coverage confirmed.', 'Approved, budget available.', null, null])
              : stepStatus === 'REJECTED'
                ? pick(['Budget not available this quarter.', 'Please resubmit next quarter.', 'Duplicate of an earlier request.'])
                : pick(['Please attach the quotation.', 'Missing receipt — please add and resubmit.', 'Please confirm the dates with your team first.']),
          actionAt: completedAt,
        });
      }
    });

    if (a.outcome === 'APPROVED') {
      status = 'APPROVED';
      decidedAt = cursor;
    } else if (a.outcome === 'REJECTED') {
      status = 'REJECTED';
    } else if (a.outcome === 'RETURNED') {
      status = 'RETURNED';
    } else if (a.outcome === 'CANCELED') {
      status = 'CANCELED';
      decidedAt = new Date(cursor.getTime() + between(4, 40) * 3_600_000);
      actionRows.push({
        id: randomUUID(),
        requestId,
        stepId: null,
        approverId: empIds.get(a.requesterCode)!,
        action: 'CANCEL',
        comment: 'Withdrawn by requester — no longer required.',
        actionAt: decidedAt,
      });
    } else if (a.outcome === 'DRAFT') {
      status = 'DRAFT';
    } else {
      const currentStep = stepRows.filter((s) => s.requestId === requestId).find((s) => s.status === 'IN_REVIEW');
      status = currentStep ? 'IN_REVIEW' : 'SUBMITTED';
    }

    // If a chain has zero steps (shouldn't happen, but be safe), close it out.
    if (materialized.length === 0 && a.outcome === 'APPROVED') decidedAt = submittedAt;

    const currentStepRow = stepRows.filter((s) => s.requestId === requestId).find((s) => s.stepOrder === currentStepOrder);
    const hoursToDue = currentStepRow?.dueAt ? (currentStepRow.dueAt.getTime() - NOW.getTime()) / 3_600_000 : null;
    const { score, priority } = scorePriority({
      amountBase: a.amountBase,
      hoursToDue: status === 'SUBMITTED' || status === 'IN_REVIEW' ? hoursToDue : null,
      riskLevel: risk,
      hasBlockingViolation: risk === 'HIGH',
      requestType: a.type,
    });

    requestRows.push({
      id: requestId,
      requestNumber: number,
      requestType: a.type,
      title: a.title,
      description: a.description,
      requesterId: empIds.get(a.requesterCode)!,
      departmentId: deptIds.get(requester.department)!,
      // The office that filed the request — the tenant boundary.
      officeId: officeIds.get(requester.office)!,
      costCenterId: ccIds.get(`CC-${requester.department}`)!,
      status,
      priority,
      priorityScore: score,
      workflowId: workflowIds.get(a.type)!,
      currentStepOrder,
      amountBase: a.amountBase.toFixed(2),
      currency: 'USD',
      amountOriginal: a.amountBase.toFixed(2),
      dueAt: currentStepRow?.dueAt ?? null,
      submittedAt,
      decidedAt,
      createdAt: submittedAt ? new Date(submittedAt.getTime() - between(1, 40) * 3_600_000) : ago(a.submittedDaysAgo),
      updatedAt: decidedAt ?? submittedAt ?? NOW,
    });

    auditRows.push({
      id: randomUUID(),
      actorId: empIds.get(a.requesterCode)!,
      actorEmail: requester.email,
      action: a.outcome === 'DRAFT' ? 'CREATE' : 'SUBMIT',
      entityType: 'request',
      entityId: requestId,
      summary: `${number} — ${a.title}`,
      metadata: { requestType: a.type, amountBase: a.amountBase },
      createdAt: submittedAt ?? ago(a.submittedDaysAgo),
    });

    const record: BuiltRequest = {
      id: requestId,
      number,
      type: a.type,
      requesterCode: a.requesterCode,
      deptCode: requester.department,
      amountBase: a.amountBase,
      status,
      submittedAt,
      decidedAt,
      currentApproverCode,
      risk,
    };
    built.push(record);
    return record;
  }

  /* -------- Leave requests -------- */
  const LEAVE_REASONS = [
    'Family holiday.',
    'Personal matters.',
    'Annual family visit.',
    'Rest after peak season.',
    'Attending a wedding.',
    'Medical appointment and recovery.',
    'Moving apartment.',
  ];

  /**
   * Running leave ledger. Generated leave never pushes an employee past their
   * entitlement, otherwise the Leave dashboard would show negative balances —
   * which no HR team would trust.
   */
  const leaveTaken = new Map<string, number>();
  function leaveHeadroom(code: string) {
    const emp = byCode.get(code)!;
    return emp.allowance - (leaveTaken.get(code) ?? 0);
  }

  function makeLeave(
    requesterCode: string,
    startOffsetDays: number,
    length: number,
    outcome: BuildArgs['outcome'],
    leaveType = 'ANNUAL',
  ) {
    const start = toISODate(new Date(NOW.getTime() + startOffsetDays * 86_400_000));
    const end = addDays(start, length - 1);
    const calc = calcWorkingDays(start, end, holidayList);
    const emp = byCode.get(requesterCode)!;

    // Annual leave in the current year consumes entitlement; sick leave has its own pool.
    const consumesAllowance =
      leaveType === 'ANNUAL' &&
      Number(start.slice(0, 4)) === year &&
      ['APPROVED', 'OPEN'].includes(outcome);
    if (consumesAllowance) {
      if (calc.workingDays > leaveHeadroom(requesterCode)) return null;
      leaveTaken.set(requesterCode, (leaveTaken.get(requesterCode) ?? 0) + calc.workingDays);
    }

    const r = buildRequest({
      type: 'LEAVE',
      requesterCode,
      title: `${leaveType === 'ANNUAL' ? 'Annual leave' : leaveType === 'SICK' ? 'Sick leave' : 'Leave'} — ${emp.name.split(' ')[0]} (${calc.workingDays}d)`,
      description: pick(LEAVE_REASONS),
      amountBase: 0,
      facts: { days: calc.workingDays },
      submittedDaysAgo: Math.max(1, -startOffsetDays + intBetween(5, 20)),
      outcome,
      stepsDone: outcome === 'OPEN' ? intBetween(0, 1) : 0,
      risk: calc.workingDays > 10 ? 'MEDIUM' : 'LOW',
    });
    leaveRows.push({
      id: randomUUID(),
      requestId: r.id,
      leaveType,
      startDate: start,
      endDate: end,
      halfDayStart: false,
      halfDayEnd: false,
      workingDays: calc.workingDays.toFixed(1),
      calendarDays: calc.calendarDays,
      reason: pick(LEAVE_REASONS),
      emergencyContact: `+84 9${intBetween(10, 99)} ${intBetween(100, 999)} ${intBetween(100, 999)}`,
      handoverTo: chance(0.6) ? empIds.get(pick(EMPLOYEES.filter((e) => e.department === emp.department && e.code !== requesterCode)).code)! : null,
    });
    return r;
  }

  /* -------- Business trips -------- */
  function makeTrip(
    leadCode: string,
    companionCodes: string[],
    startOffsetDays: number,
    nights: number,
    outcome: BuildArgs['outcome'],
    opts: { destIndex?: number; hotelPremium?: number; stepsDone?: number } = {},
  ) {
    const dest = opts.destIndex != null ? TRIP_DESTINATIONS[opts.destIndex] : pick(TRIP_DESTINATIONS);
    const purpose = pick(TRIP_PURPOSES);
    const start = toISODate(new Date(NOW.getTime() + startOffsetDays * 86_400_000));
    const end = addDays(start, nights);
    const travellers = [leadCode, ...companionCodes];
    const hotelRate = round2(dest.hotelRate * (opts.hotelPremium ?? between(0.9, 1.12)));

    const lines = [
      { category: 'FLIGHT', amount: round2(dest.flightCost * travellers.length * between(0.92, 1.15)), description: `Return flights × ${travellers.length}` },
      { category: 'HOTEL', amount: round2(hotelRate * nights * travellers.length), description: `${nights} night(s) × ${travellers.length} room(s) @ $${hotelRate.toFixed(0)}` },
      { category: 'TRANSPORT', amount: round2(dest.transport * travellers.length), description: 'Airport transfers and local transport' },
      { category: 'MEAL', amount: round2(dest.meal * (nights + 1) * travellers.length), description: `Meal allowance, ${nights + 1} day(s)` },
    ];
    if (purpose.event) lines.push({ category: 'EVENT_FEE', amount: round2(between(120, 480) * travellers.length), description: `${purpose.event} registration` });
    if (dest.international && chance(0.3)) lines.push({ category: 'VISA', amount: round2(between(35, 110) * travellers.length), description: 'Visa and travel documents' });

    const total = round2(lines.reduce((s, l) => s + l.amount, 0));
    const risk: 'LOW' | 'MEDIUM' | 'HIGH' = hotelRate > 150 ? (hotelRate > 185 ? 'HIGH' : 'MEDIUM') : total > 4000 ? 'MEDIUM' : 'LOW';

    const r = buildRequest({
      type: 'BUSINESS_TRIP',
      requesterCode: leadCode,
      title: `Business trip — ${dest.city}, ${dest.country} (${travellers.length} traveller${travellers.length > 1 ? 's' : ''})`,
      description: purpose.purpose,
      amountBase: total,
      facts: { isInternational: dest.international, days: nights + 1 },
      submittedDaysAgo: Math.max(1, -startOffsetDays + intBetween(6, 25)),
      outcome,
      stepsDone: opts.stepsDone ?? (outcome === 'OPEN' ? intBetween(0, 2) : 0),
      risk,
    });

    const tripId = randomUUID();
    tripRows.push({
      id: tripId,
      requestId: r.id,
      country: dest.country,
      city: dest.city,
      isInternational: dest.international,
      purpose: purpose.purpose,
      eventName: purpose.event,
      partner: chance(0.35) ? pick(['Partner hotel group', 'Regional OTA partner', 'Local DMC']) : null,
      startDate: start,
      endDate: end,
      durationDays: nights + 1,
      outboundFlight: dest.international ? `VN${intBetween(400, 999)}` : `VN${intBetween(100, 299)}`,
      inboundFlight: dest.international ? `VN${intBetween(400, 999)}` : `VN${intBetween(100, 299)}`,
      hotelName: `${dest.city} ${pick(['Central', 'Grand', 'Business', 'Airport', 'Riverside'])} Hotel`,
      hotelNights: nights,
      hotelRatePerNight: hotelRate.toFixed(2),
      transportation: pick(['Taxi and metro', 'Airport transfer + taxi', 'Rental car', 'Company shuttle']),
      currency: 'USD',
      exchangeRate: '1',
      totalOriginal: total.toFixed(2),
      totalBase: total.toFixed(2),
    });
    travellers.forEach((code, i) =>
      travelerRows.push({ id: randomUUID(), tripId, employeeId: empIds.get(code)!, isLead: i === 0 }),
    );
    lines.forEach((l) =>
      tripCostRows.push({
        id: randomUUID(),
        tripId,
        category: l.category,
        description: l.description,
        currency: 'USD',
        amountOriginal: l.amount.toFixed(2),
        exchangeRate: '1',
        amountBase: l.amount.toFixed(2),
      }),
    );
    if (r.status !== 'DRAFT') {
      attachmentRows.push({
        id: randomUUID(),
        requestId: r.id,
        fileName: `flight-itinerary-${r.number}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: intBetween(80_000, 320_000),
        kind: 'ITINERARY',
        storagePath: `demo/${r.number}/itinerary.pdf`,
        uploadedBy: empIds.get(leadCode)!,
        createdAt: r.submittedAt ?? NOW,
      });
    }
    return r;
  }

  /* -------- Purchase requests -------- */
  /** `requesterCode: null` picks a requester from a department that plausibly buys the item. */
  function makePR(
    requesterCode: string | null,
    daysAgo: number,
    outcome: BuildArgs['outcome'],
    opts: { itemIndex?: number; qty?: number; stepsDone?: number } = {},
  ) {
    const item = opts.itemIndex != null ? PURCHASE_ITEMS_POOL[opts.itemIndex] : pick(PURCHASE_ITEMS_POOL);
    if (!requesterCode) {
      const candidates = EMPLOYEES.filter((e) => item.depts.includes(e.department));
      requesterCode = pick(candidates.length ? candidates : EMPLOYEES).code;
    }
    const qty = opts.qty ?? intBetween(1, item.maxQty);
    const unit = round2(item.unit * between(0.97, 1.05));
    const total = round2(unit * qty);
    const quotationCount = total > 3000 ? (chance(0.6) ? 2 : 1) : 1;
    const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
      total > 3000 && quotationCount < 2 ? 'HIGH' : unit > item.prevUnit * 1.15 ? 'MEDIUM' : total > 2000 ? 'MEDIUM' : 'LOW';

    const r = buildRequest({
      type: 'PURCHASE',
      requesterCode,
      title: `${item.name} × ${qty}`,
      description: `Purchase of ${qty} × ${item.name} from ${VENDORS.find((v) => v.code === item.vendor)!.name}.`,
      amountBase: total,
      facts: { quotationCount },
      submittedDaysAgo: daysAgo,
      outcome,
      stepsDone: opts.stepsDone ?? (outcome === 'OPEN' ? intBetween(0, 2) : 0),
      risk,
    });

    const prId = randomUUID();
    const requester = byCode.get(requesterCode)!;
    prRows.push({
      id: prId,
      requestId: r.id,
      vendorId: vendorIds.get(item.vendor)!,
      category: item.category,
      purpose: pick([
        'Replacement of end-of-life equipment.',
        'New team member onboarding.',
        'Campaign delivery for the coming quarter.',
        'Capacity expansion for peak season.',
        'Annual licence renewal.',
      ]),
      requiredDate: toISODate(new Date(NOW.getTime() + intBetween(7, 45) * 86_400_000)),
      budgetId: budgetIds.get(`${requester.department}:PROCUREMENT`) ?? null,
      quotationCount,
      currency: 'USD',
      exchangeRate: '1',
      totalOriginal: total.toFixed(2),
      totalBase: total.toFixed(2),
    });
    prItemRows.push({
      id: randomUUID(),
      purchaseRequestId: prId,
      itemName: item.name,
      description: `Vendor: ${VENDORS.find((v) => v.code === item.vendor)!.name}`,
      quantity: qty.toFixed(2),
      unitPrice: unit.toFixed(2),
      lineTotal: total.toFixed(2),
    });
    if (quotationCount > 0 && r.status !== 'DRAFT') {
      for (let i = 0; i < quotationCount; i++) {
        attachmentRows.push({
          id: randomUUID(),
          requestId: r.id,
          fileName: `quotation-${i + 1}-${r.number}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: intBetween(60_000, 240_000),
          kind: 'QUOTATION',
          storagePath: `demo/${r.number}/quotation-${i + 1}.pdf`,
          uploadedBy: empIds.get(requesterCode)!,
          createdAt: r.submittedAt ?? NOW,
        });
      }
    }
    return r;
  }

  /* -------- Expense claims -------- */
  function makeExpense(
    requesterCode: string,
    daysAgo: number,
    outcome: BuildArgs['outcome'],
    opts: {
      lines?: number;
      linkTripId?: string;
      /** Appends an exact copy of an existing line so duplicate detection has something real to find. */
      duplicateOf?: { merchant: string; date: string; amount: number };
      stepsDone?: number;
    } = {},
  ) {
    const lineCount = opts.lines ?? intBetween(2, 5);
    const cats = pickMany(Object.keys(EXPENSE_MERCHANTS), Math.min(lineCount, Object.keys(EXPENSE_MERCHANTS).length));
    const items = cats.map((cat) => {
      const amount = round2(
        cat === 'FLIGHT' ? between(180, 620) : cat === 'HOTEL' ? between(90, 210) : cat === 'SOFTWARE' ? between(60, 340) : between(12, 95),
      );
      return {
        category: cat,
        merchant: pick(EXPENSE_MERCHANTS[cat]),
        amount,
        date: toISODate(new Date(NOW.getTime() - (daysAgo + intBetween(0, 6)) * 86_400_000)),
      };
    });
    if (opts.duplicateOf) {
      items.push({ category: 'MEAL', merchant: opts.duplicateOf.merchant, amount: opts.duplicateOf.amount, date: opts.duplicateOf.date });
    }
    const total = round2(items.reduce((s, i) => s + i.amount, 0));
    const mealTotal = items.filter((i) => i.category === 'MEAL').reduce((s, i) => s + i.amount, 0);
    const risk: 'LOW' | 'MEDIUM' | 'HIGH' = opts.duplicateOf ? 'HIGH' : mealTotal > 50 ? 'MEDIUM' : 'LOW';

    const r = buildRequest({
      type: 'EXPENSE',
      requesterCode,
      title: `Expense claim — ${items.length} item${items.length > 1 ? 's' : ''}`,
      description: opts.linkTripId ? 'Expenses incurred during an approved business trip.' : 'Business expenses for reimbursement.',
      amountBase: total,
      facts: {},
      submittedDaysAgo: daysAgo,
      outcome,
      stepsDone: opts.stepsDone ?? (outcome === 'OPEN' ? intBetween(0, 1) : 0),
      risk,
    });

    const claimId = randomUUID();
    claimRows.push({
      id: claimId,
      requestId: r.id,
      tripRequestId: opts.linkTripId ?? null,
      paymentMethod: pick(['PERSONAL', 'PERSONAL', 'CORPORATE_CARD']),
      currency: 'USD',
      exchangeRate: '1',
      totalOriginal: total.toFixed(2),
      totalBase: total.toFixed(2),
      reimbursedAt: r.status === 'APPROVED' ? new Date((r.decidedAt ?? NOW).getTime() + 3 * 86_400_000) : null,
    });
    items.forEach((i) => {
      const attachmentId = randomUUID();
      attachmentRows.push({
        id: attachmentId,
        requestId: r.id,
        fileName: `receipt-${i.merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i.date}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: intBetween(120_000, 900_000),
        kind: 'RECEIPT',
        storagePath: `demo/${r.number}/receipt-${i.date}.jpg`,
        contentHash: receiptHash(i.merchant, i.date, i.amount),
        uploadedBy: empIds.get(requesterCode)!,
        createdAt: r.submittedAt ?? NOW,
      });
      claimItemRows.push({
        id: randomUUID(),
        claimId,
        expenseDate: i.date,
        category: i.category,
        merchant: i.merchant,
        description: `${i.category.charAt(0)}${i.category.slice(1).toLowerCase()} — ${i.merchant}`,
        currency: 'USD',
        amountOriginal: i.amount.toFixed(2),
        exchangeRate: '1',
        amountBase: i.amount.toFixed(2),
        taxAmount: round2(i.amount * 0.1).toFixed(2),
        receiptHash: receiptHash(i.merchant, i.date, i.amount),
        attachmentId,
        extractedByAi: chance(0.7),
      });
    });
    return r;
  }

  function receiptHash(merchant: string, date: string, amount: number) {
    return createHash('sha256').update(`${merchant.toLowerCase()}|${date}|${amount.toFixed(2)}`).digest('hex').slice(0, 32);
  }

  /* -------- HR & general -------- */
  function makeHR(requesterCode: string, daysAgo: number, outcome: BuildArgs['outcome'], kindIndex?: number) {
    const kind = kindIndex != null ? HR_REQUEST_KINDS[kindIndex] : pick(HR_REQUEST_KINDS);
    const r = buildRequest({
      type: 'HR',
      requesterCode,
      title: kind.category,
      description: kind.details,
      amountBase: 0,
      facts: {},
      submittedDaysAgo: daysAgo,
      outcome,
      stepsDone: outcome === 'OPEN' ? intBetween(0, 1) : 0,
      risk: 'LOW',
    });
    genericRows.push({
      id: randomUUID(),
      requestId: r.id,
      category: kind.category,
      details: kind.details,
      requestedDate: toISODate(new Date(NOW.getTime() + intBetween(5, 30) * 86_400_000)),
    });
    return r;
  }

  function makeGeneral(requesterCode: string, daysAgo: number, outcome: BuildArgs['outcome'], kindIndex?: number) {
    const kind = kindIndex != null ? GENERAL_REQUEST_KINDS[kindIndex] : pick(GENERAL_REQUEST_KINDS);
    const r = buildRequest({
      type: 'GENERAL',
      requesterCode,
      title: kind.title,
      description: kind.details,
      amountBase: kind.amount,
      facts: {},
      submittedDaysAgo: daysAgo,
      outcome,
      stepsDone: outcome === 'OPEN' ? intBetween(0, 1) : 0,
      risk: kind.amount > 3000 ? 'MEDIUM' : 'LOW',
    });
    genericRows.push({
      id: randomUUID(),
      requestId: r.id,
      category: 'General approval',
      details: kind.details,
      requestedDate: toISODate(new Date(NOW.getTime() + intBetween(5, 30) * 86_400_000)),
    });
    return r;
  }

  /* ---------------------------------------------------------------- */
  /* 1. Open requests — what an approver sees today                    */
  /* ---------------------------------------------------------------- */

  // Headline demo request: Seoul trip, 3 travellers, hotel over policy.
  const seoulTrip = makeTrip('E011', ['E040', 'E010'], 27, 2, 'OPEN', { destIndex: 0, hotelPremium: 1.23, stepsDone: 2 });

  makeTrip('E012', ['E041'], 17, 3, 'OPEN', { destIndex: 3, stepsDone: 2 });
  makeTrip('E021', [], 24, 2, 'OPEN', { destIndex: 1, hotelPremium: 1.05, stepsDone: 2 });
  makeTrip('E022', ['E023'], 31, 3, 'OPEN', { destIndex: 2, stepsDone: 2 });
  makeTrip('E031', [], 12, 1, 'OPEN', { destIndex: 5, stepsDone: 1 });
  makeTrip('E042', ['E043'], 20, 2, 'OPEN', { destIndex: 0, stepsDone: 2 });
  makeTrip('E014', [], 9, 2, 'OPEN', { destIndex: 4, stepsDone: 2 });

  makePR('E051', 3, 'OPEN', { itemIndex: 0, qty: 3, stepsDone: 2 });
  makePR('E013', 2, 'OPEN', { itemIndex: 10, qty: 2, stepsDone: 2 });
  makePR('E044', 4, 'OPEN', { itemIndex: 9, qty: 2, stepsDone: 2 });
  makePR('E023', 1, 'OPEN', { itemIndex: 6, qty: 1, stepsDone: 2 });
  makePR('E032', 5, 'OPEN', { itemIndex: 13, qty: 2, stepsDone: 2 });
  makePR('E052', 6, 'OPEN', { itemIndex: 5, qty: 1, stepsDone: 2 });

  makeGeneral('E030', 3, 'OPEN', 5);
  makeGeneral('E060', 2, 'OPEN', 1);

  // Pending earlier in the chain (manager / HR / finance queues).
  makeLeave('E012', 21, 5, 'OPEN');
  makeLeave('E042', 12, 3, 'OPEN');
  makeLeave('E043', 13, 4, 'OPEN');
  makeLeave('E033', 26, 12, 'OPEN', 'ANNUAL');
  makeLeave('E021', 9, 2, 'OPEN');
  makeLeave('E071', 30, 5, 'OPEN');

  makeExpense('E011', 2, 'OPEN', { lines: 4 });
  makeExpense('E022', 4, 'OPEN', { lines: 3 });
  makeExpense('E031', 1, 'OPEN', { lines: 5 });
  // Duplicate-submission scenario: the same restaurant bill claimed twice, three
  // weeks apart. The first claim is already approved and paid.
  const DUPLICATE_LINE = { merchant: 'Gangnam Gogi House', date: toISODate(ago(24)), amount: 78.4 };
  makeExpense('E041', 22, 'APPROVED', { lines: 2, duplicateOf: DUPLICATE_LINE });
  makeExpense('E041', 6, 'OPEN', { lines: 3, duplicateOf: DUPLICATE_LINE });
  makeHR('E034', 5, 'OPEN', 1);
  makeHR('E013', 8, 'OPEN', 0);

  // Drafts (only visible to their owner).
  makeLeave('E012', 40, 3, 'DRAFT');
  makePR('E012', 0, 'DRAFT', { itemIndex: 1, qty: 2 });

  // Returned / canceled / rejected — so every status appears in the UI.
  makePR('E042', 11, 'RETURNED', { itemIndex: 7, qty: 1, stepsDone: 1 });
  makeExpense('E032', 15, 'RETURNED', { lines: 2 });
  makeTrip('E044', [], 35, 2, 'CANCELED', { destIndex: 6 });
  makePR('E033', 22, 'REJECTED', { itemIndex: 3, qty: 6, stepsDone: 1 });
  makeLeave('E032', 18, 8, 'REJECTED');

  /* ---------------------------------------------------------------- */
  /* 2. Twelve months of closed history                                */
  /* ---------------------------------------------------------------- */

  const allCodes = EMPLOYEES.map((e) => e.code);
  const travellerCodes = EMPLOYEES.filter((e) => ['SCM', 'GSM', 'CT', 'OP', 'CEO'].includes(e.department)).map((e) => e.code);

  const daysElapsedThisMonth = NOW.getUTCDate();

  for (let monthsBack = 11; monthsBack >= 0; monthsBack--) {
    // Slight upward trend toward the present + a travel spike last month, so the
    // "travel expenses increased" insight has something real behind it.
    const trend = 1 + (11 - monthsBack) * 0.03;
    const spike = monthsBack === 1 ? 1.45 : 1;
    // The current month is only partially elapsed — scale its volume to match,
    // otherwise the month-to-date figure looks like a collapse rather than a partial month.
    const monthShare = monthsBack === 0 ? Math.max(0.25, daysElapsedThisMonth / 30) : 1;
    const volume = Math.round(30 * trend * spike * monthShare);

    for (let i = 0; i < volume; i++) {
      const daysAgo =
        monthsBack === 0 ? intBetween(2, Math.max(3, daysElapsedThisMonth - 1)) : monthsBack * 30 + intBetween(1, 28);
      const roll = rand();
      const outcome: BuildArgs['outcome'] = chance(0.06) ? 'REJECTED' : chance(0.03) ? 'CANCELED' : 'APPROVED';

      if (roll < 0.26) {
        makeLeave(pick(allCodes), -daysAgo, intBetween(1, 6), outcome, chance(0.15) ? 'SICK' : 'ANNUAL');
      } else if (roll < 0.45) {
        const lead = pick(travellerCodes);
        const companions = chance(0.4) ? pickMany(travellerCodes.filter((c) => c !== lead), intBetween(1, 2)) : [];
        makeTrip(lead, companions, -daysAgo, intBetween(1, 4), outcome, {
          destIndex: monthsBack === 1 ? 0 : undefined,
        });
      } else if (roll < 0.62) {
        makePR(null, daysAgo, outcome);
      } else if (roll < 0.88) {
        makeExpense(pick(allCodes), daysAgo, outcome, { lines: intBetween(2, 5) });
      } else if (roll < 0.94) {
        makeHR(pick(allCodes), daysAgo, outcome);
      } else {
        makeGeneral(pick(allCodes), daysAgo, outcome);
      }
    }
  }

  log(`requests ${requestRows.length}, approval steps ${stepRows.length}, actions ${actionRows.length}`);

  /* ---------------------------------------------------------------- */
  /* 3. Conversation, AI reviews and notifications on open items       */
  /* ---------------------------------------------------------------- */

  for (const r of built) {
    if (['DRAFT'].includes(r.status)) continue;

    if (chance(0.35)) {
      const author = r.currentApproverCode ?? byCode.get(r.requesterCode)!.managerCode ?? 'E001';
      commentRows.push({
        id: randomUUID(),
        requestId: r.id,
        authorId: empIds.get(author)!,
        authorType: 'USER',
        body: pick([
          'Could you confirm the dates with the team before this goes to Finance?',
          'Thanks — the quotation is attached, this looks complete now.',
          'Please note the department budget is tight this quarter.',
          'Approved on my side, passing to the next step.',
          'Is this covered by the existing vendor agreement?',
          'Adding @Finance for visibility on the payment terms.',
        ]),
        createdAt: new Date((r.submittedAt ?? NOW).getTime() + between(2, 40) * 3_600_000),
        mentions: [],
      });
    }

    // Notify the person who currently has to act.
    if (r.currentApproverCode && ['SUBMITTED', 'IN_REVIEW'].includes(r.status)) {
      notificationRows.push({
        id: randomUUID(),
        employeeId: empIds.get(r.currentApproverCode)!,
        type: 'APPROVAL_REQUIRED',
        title: `Approval required — ${r.number}`,
        body: `${byCode.get(r.requesterCode)!.name} submitted a request for your review.`,
        requestId: r.id,
        severity: r.risk === 'HIGH' ? 'CRITICAL' : r.risk === 'MEDIUM' ? 'WARNING' : 'INFO',
        isRead: chance(0.25),
        createdAt: r.submittedAt ?? NOW,
      });
    }
    if (r.status === 'APPROVED' && r.decidedAt && daysBetween(toISODate(r.decidedAt), toISODate(NOW)) < 14) {
      notificationRows.push({
        id: randomUUID(),
        employeeId: empIds.get(r.requesterCode)!,
        type: 'REQUEST_APPROVED',
        title: `Approved — ${r.number}`,
        body: 'Your request has completed all approval steps.',
        requestId: r.id,
        severity: 'INFO',
        isRead: chance(0.6),
        createdAt: r.decidedAt,
      });
    }
    if (r.status === 'RETURNED') {
      notificationRows.push({
        id: randomUUID(),
        employeeId: empIds.get(r.requesterCode)!,
        type: 'REQUEST_RETURNED',
        title: `Returned for correction — ${r.number}`,
        body: 'An approver asked for changes before this can continue.',
        requestId: r.id,
        severity: 'WARNING',
        isRead: false,
        createdAt: r.submittedAt ?? NOW,
      });
    }
  }

  await db.insert(requests).values(requestRows);
  if (leaveRows.length) await db.insert(leaveRequests).values(leaveRows);
  if (tripRows.length) await db.insert(businessTrips).values(tripRows);
  if (travelerRows.length) await db.insert(tripTravelers).values(travelerRows);
  if (tripCostRows.length) await db.insert(tripCosts).values(tripCostRows);
  if (prRows.length) await db.insert(purchaseRequests).values(prRows);
  if (prItemRows.length) await db.insert(purchaseItems).values(prItemRows);
  if (claimRows.length) await db.insert(expenseClaims).values(claimRows);
  if (attachmentRows.length) await chunked(db, attachments, attachmentRows);
  if (claimItemRows.length) await chunked(db, expenseItems, claimItemRows);
  if (genericRows.length) await db.insert(genericRequests).values(genericRows);
  await chunked(db, approvalSteps, stepRows);
  await chunked(db, approvalActions, actionRows);
  if (commentRows.length) await chunked(db, comments, commentRows);
  if (notificationRows.length) await chunked(db, notifications, notificationRows);

  /* ---------------------------------------------------------------- */
  /* 4. Derived aggregates — budgets and leave balances                */
  /* ---------------------------------------------------------------- */

  // Budget: APPROVED spend counts as `spent`, in-flight counts as `committed`.
  const budgetAcc = new Map<string, { committed: number; spent: number }>();
  for (const r of built) {
    const category = r.type === 'BUSINESS_TRIP' || r.type === 'EXPENSE' ? 'TRAVEL' : r.type === 'PURCHASE' ? 'PROCUREMENT' : 'OPERATING';
    const key = `${r.deptCode}:${category}`;
    if (!budgetIds.has(key)) continue;
    if (!r.submittedAt) continue;
    // Only the current quarter rolls up into the current quarter's budget.
    const q = Math.floor(r.submittedAt.getUTCMonth() / 3) + 1;
    if (q !== quarter || r.submittedAt.getUTCFullYear() !== year) continue;

    const acc = budgetAcc.get(key) ?? { committed: 0, spent: 0 };
    if (r.status === 'APPROVED') acc.spent += r.amountBase;
    else if (['SUBMITTED', 'IN_REVIEW'].includes(r.status)) acc.committed += r.amountBase;
    budgetAcc.set(key, acc);
  }
  /**
   * Calibrate allocations against what was actually generated.
   *
   * The planned figures above are a starting point, but the generator's real
   * spend has to land inside a believable utilisation band or the Budget page
   * shows nonsense like 1,100% used. Allocation is therefore back-solved from
   * actual spend at a target utilisation, rounded to a planning-friendly number.
   *
   * Two departments are deliberately pushed past their limit so the budget-risk
   * and AI-insight surfaces have genuine findings to report rather than staged ones.
   */
  const OVER_BUDGET: Record<string, number> = { 'SCM:TRAVEL': 0.87, 'GSM:PROCUREMENT': 1.08 };
  const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

  for (const [key, plannedId] of budgetIds) {
    const acc = budgetAcc.get(key) ?? { committed: 0, spent: 0 };
    const consumed = acc.spent + acc.committed;
    const target = OVER_BUDGET[key] ?? between(0.42, 0.78);
    // Floor: a planned quarterly line is never a few hundred dollars, even where
    // the generated activity happens to be light.
    const allocated = roundTo(Math.max(consumed / target, between(2500, 4500)), 250);
    await db
      .update(budgets)
      .set({
        allocated: allocated.toFixed(2),
        committed: acc.committed.toFixed(2),
        spent: acc.spent.toFixed(2),
      })
      .where(eq(budgets.id, plannedId));
  }

  // Leave balance: approved leave -> used, in-flight -> pending.
  const leaveByRequest = new Map(leaveRows.map((l) => [l.requestId, l]));
  const leaveAcc = new Map<string, { used: number; pending: number }>();
  for (const r of built) {
    if (r.type !== 'LEAVE') continue;
    const detail = leaveByRequest.get(r.id);
    if (!detail) continue;
    const startYear = Number(String(detail.startDate).slice(0, 4));
    if (startYear !== year) continue;
    const key = `${r.requesterCode}:${detail.leaveType}`;
    const acc = leaveAcc.get(key) ?? { used: 0, pending: 0 };
    const days = Number(detail.workingDays);
    if (r.status === 'APPROVED') acc.used += days;
    else if (['SUBMITTED', 'IN_REVIEW'].includes(r.status)) acc.pending += days;
    leaveAcc.set(key, acc);
  }
  const { and } = await import('drizzle-orm');
  for (const [key, acc] of leaveAcc) {
    const [code, type] = key.split(':');
    await db
      .update(leaveBalances)
      .set({ used: acc.used.toFixed(1), pending: acc.pending.toFixed(1) })
      .where(
        and(
          eq(leaveBalances.employeeId, empIds.get(code)!),
          eq(leaveBalances.year, year),
          eq(leaveBalances.leaveType, type),
        ),
      );
  }

  /* -------- Audit log + settings -------- */
  for (const e of pickMany(EMPLOYEES, 12)) {
    auditRows.push({
      id: randomUUID(),
      actorId: empIds.get(e.code)!,
      actorEmail: e.email,
      action: 'LOGIN',
      entityType: 'session',
      entityId: null,
      summary: `${e.name} signed in`,
      metadata: null,
      createdAt: ago(intBetween(0, 20), intBetween(0, 20)),
    });
  }
  auditRows.push({
    id: randomUUID(),
    actorId: empIds.get('E050')!,
    actorEmail: 'admin@ohmyhotel.com',
    action: 'POLICY_CHANGE',
    entityType: 'policy',
    entityId: 'POL-HOTEL',
    summary: 'Hotel rate cap raised from $130 to $150 per night',
    metadata: { before: 130, after: 150 },
    createdAt: ago(46),
  });
  await chunked(db, auditLogs, auditRows);

  /*
   * Saved approval lines, named the way the company already names them:
   * 목적_부서 — "휴가계_Global Sales & Marketing", "지출결의_Marketing".
   *
   * Members are the department head plus the relevant function, which is what
   * these lines contain in practice. They are a starting point the requester
   * edits, not a rule, so seeding plausible ones matters more than seeding
   * exhaustive ones.
   */
  const lineRows: (typeof approvalLines.$inferInsert)[] = [];
  const lineMemberRows: (typeof approvalLineMembers.$inferInsert)[] = [];

  const headOf = (deptCode: string) => {
    const dept = DEPARTMENTS.find((d) => d.code === deptCode);
    const head = EMPLOYEES.find((e) => e.department === deptCode && e.isDeptHead);
    void dept;
    return head ? empIds.get(head.code) ?? null : null;
  };
  const empIdByCode = (code: string) => empIds.get(code) ?? null;

  const addLine = (
    name: string,
    requestType: string | null,
    deptCode: string | null,
    memberIds: (string | null)[],
    order: number,
  ) => {
    const members = memberIds.filter(Boolean) as string[];
    if (members.length === 0) return;
    const lineId = randomUUID();
    lineRows.push({
      id: lineId,
      name,
      ownerId: null,
      officeId: deptCode ? officeIds.get(DEPARTMENTS.find((d) => d.code === deptCode)?.office ?? 'VN') ?? null : null,
      requestType,
      departmentId: deptCode ? deptIds.get(deptCode) ?? null : null,
      sortOrder: order,
    });
    members.forEach((employeeId, i) => {
      lineMemberRows.push({
        id: randomUUID(),
        lineId,
        employeeId,
        memberType: 'APPROVER',
        position: i + 1,
      });
    });
  };

  const hrHead = headOf('HR');
  const finHead = headOf('FIN');
  const director = empIdByCode('E001');

  for (const dept of DEPARTMENTS) {
    const head = headOf(dept.code);
    if (!head) continue;
    addLine(`휴가계_${dept.name}`, 'LEAVE', dept.code, [head, hrHead], 10);
    addLine(`지출결의_${dept.name}`, 'PURCHASE', dept.code, [head, finHead, director], 20);
    addLine(`출장품의_${dept.name}`, 'BUSINESS_TRIP', dept.code, [head, finHead], 30);
  }

  if (lineRows.length) {
    await db.insert(approvalLines).values(lineRows);
    await db.insert(approvalLineMembers).values(lineMemberRows);
  }

  // Form templates. Office-scoped ones resolve their code (JP / KR / …) to an id;
  // a null office means every office may file it.
  await db.insert(formTemplates).values(
    FORM_TEMPLATES.map((t) => ({
      id: randomUUID(),
      code: t.code,
      nameEn: t.nameEn,
      nameKo: t.nameKo,
      descriptionEn: t.descriptionEn ?? null,
      descriptionKo: t.descriptionKo ?? null,
      officeId: t.office ? (officeIds.get(t.office) ?? null) : null,
      category: t.category,
      icon: t.icon,
      fields: t.fields,
      titlePattern: t.titlePattern,
      amountField: t.amountField ?? null,
      amountCommitsBudget: t.amountCommitsBudget ?? true,
      keywords: t.keywords,
      sortOrder: t.sortOrder,
    })),
  );

  await db.insert(systemSettings).values([
    { key: 'company.name', value: 'OHMY Hotel Group', description: 'Display name used across the app.' },
    { key: 'company.baseCurrency', value: 'USD', description: 'Reporting currency for all analytics.' },
    { key: 'approval.defaultSlaHours', value: 24, description: 'Fallback SLA when a workflow step does not specify one.' },
    { key: 'ai.enabled', value: true, description: 'Master switch for AI features.' },
    { key: 'demo.mode', value: true, description: 'Marks this dataset as prototype demo data.' },
    // Executives have no department head to derive from. Designating them here
    // means replacing the person re-routes every future request without editing
    // a single workflow. Values are employee codes.
    { key: 'approver.CEO', value: 'E001', description: 'Employee code approving CEO workflow steps.' },
    { key: 'approver.CTO', value: 'E050', description: 'Employee code approving CTO workflow steps.' },
    { key: 'approver.DIRECTOR', value: 'E001', description: 'Employee code approving Director workflow steps.' },
  ]);

  log(`comments ${commentRows.length}, notifications ${notificationRows.length}, audit ${auditRows.length}`);
  log('seed complete');

  return { requests: requestRows.length, employees: EMPLOYEES.length, seoulTripNumber: seoulTrip.number };
}

/** PGlite has a parameter ceiling per statement; insert wide tables in slices. */
async function chunked<T extends Record<string, unknown>>(
  db: Database,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  rows: T[],
  size = 200,
) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

/** Rows already present? Used by both the CLI and the first-boot bootstrap. */
export async function isSeeded(db: Database): Promise<boolean> {
  const { sql } = await import('drizzle-orm');
  const rows = await db.select({ c: sql<number>`count(*)::int` }).from(employees);
  return Number(rows[0]?.c ?? 0) > 0;
}
