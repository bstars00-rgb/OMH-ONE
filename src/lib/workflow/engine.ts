/**
 * Universal approval engine.
 *
 * A workflow is a list of *template* steps with a condition. Submitting a request
 * evaluates those conditions against the request's own facts (amount, duration,
 * international or not) and materializes the steps that apply into
 * `approval_steps`, each bound to a concrete approver.
 *
 * Everything downstream — inbox, SLA, timeline, bottleneck analytics — reads the
 * materialized steps, so no request type needs bespoke approval code.
 */
import type { ApproverRole, RequestStatus } from '@/types/domain';

export interface WorkflowStepTemplate {
  stepOrder: number;
  name: string;
  approverRole: string;
  /** Fixed approver. When set, the role is only a label. */
  approverEmployeeId?: string | null;
  slaHours: number;
  conditionType: string;
  conditionValue: string | number | null;
}

export interface RequestFacts {
  amountBase: number;
  isInternational: boolean;
  /** Leave working days / trip duration — whatever "size in days" means for the type. */
  days: number;
  /** Supporting document count, for REQUIRES-style conditions. */
  quotationCount: number;
}

export interface ApproverDirectory {
  requesterId: string;
  /** Requester's line manager. */
  managerId: string | null;
  /** Head of the requester's department. */
  deptHeadId: string | null;
  hrId: string | null;
  financeId: string | null;
  directorId: string | null;
  /** Executive holders, designated in system settings. */
  ctoId: string | null;
  ceoId: string | null;
}

export interface MaterializedStep {
  stepOrder: number;
  name: string;
  approverRole: string;
  approverId: string | null;
  slaHours: number;
}

export function conditionHolds(step: WorkflowStepTemplate, facts: RequestFacts): boolean {
  const value = step.conditionValue === null ? 0 : Number(step.conditionValue);
  switch (step.conditionType) {
    case 'ALWAYS':
      return true;
    case 'AMOUNT_GT':
      return facts.amountBase > value;
    case 'DAYS_GT':
      return facts.days > value;
    case 'INTERNATIONAL':
      return facts.isInternational;
    case 'QUOTATIONS_LT':
      return facts.quotationCount < value;
    default:
      return true;
  }
}

function resolveApprover(role: string, dir: ApproverDirectory): string | null {
  switch (role as ApproverRole) {
    case 'MANAGER':
      return dir.managerId;
    case 'DEPT_HEAD':
      // A department head cannot approve their own request — escalate to their manager.
      return dir.deptHeadId === dir.requesterId ? dir.managerId : dir.deptHeadId;
    case 'HR':
      return dir.hrId;
    case 'FINANCE':
      return dir.financeId;
    case 'DIRECTOR':
      return dir.directorId;
    case 'CTO':
      return dir.ctoId;
    case 'CEO':
      return dir.ceoId;
    default:
      return null;
  }
}

/**
 * Build the concrete approval chain.
 *
 * Applies three rules that keep routes sane in a small company where one person
 * often wears several hats:
 *   1. skip steps whose condition does not hold;
 *   2. never route a request to its own requester;
 *   3. collapse consecutive steps that resolve to the same approver.
 *
 * If every step collapses away (e.g. the Director files their own request), a
 * single Director step is kept so nothing can self-approve into APPROVED silently.
 */
export function materializeSteps(
  templates: WorkflowStepTemplate[],
  facts: RequestFacts,
  dir: ApproverDirectory,
): MaterializedStep[] {
  const out: MaterializedStep[] = [];

  for (const t of [...templates].sort((a, b) => a.stepOrder - b.stepOrder)) {
    if (!conditionHolds(t, facts)) continue;

    // A named approver takes precedence; the role is then only a label.
    const approverId = t.approverEmployeeId ?? resolveApprover(t.approverRole, dir);
    if (!approverId) continue;
    if (approverId === dir.requesterId) continue;
    if (out.length && out[out.length - 1].approverId === approverId) continue;

    out.push({
      stepOrder: out.length + 1,
      name: t.name,
      approverRole: t.approverRole,
      approverId,
      slaHours: t.slaHours,
    });
  }

  if (out.length === 0 && dir.directorId && dir.directorId !== dir.requesterId) {
    out.push({ stepOrder: 1, name: 'Director Approval', approverRole: 'DIRECTOR', approverId: dir.directorId, slaHours: 48 });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

export type ApprovalAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN' | 'CANCEL';

const ALLOWED: Record<ApprovalAction, RequestStatus[]> = {
  SUBMIT: ['DRAFT', 'RETURNED'],
  APPROVE: ['SUBMITTED', 'IN_REVIEW'],
  REJECT: ['SUBMITTED', 'IN_REVIEW'],
  RETURN: ['SUBMITTED', 'IN_REVIEW'],
  CANCEL: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED'],
};

export function canTransition(action: ApprovalAction, from: RequestStatus): boolean {
  return ALLOWED[action].includes(from);
}

/**
 * Carries an i18n key rather than prose, so the same failure reads correctly in
 * whichever language the user is working in. `message` keeps the key for logs.
 */
export class WorkflowError extends Error {
  readonly code = 'WORKFLOW_INVALID';
  readonly vars?: Record<string, string | number>;
  constructor(messageKey: string, vars?: Record<string, string | number>) {
    super(messageKey);
    this.name = 'WorkflowError';
    this.vars = vars;
  }
}

/** Due date for a step, from when it became the active step. */
export function stepDueAt(startedAt: Date, slaHours: number): Date {
  return new Date(startedAt.getTime() + slaHours * 3_600_000);
}

/* ------------------------------------------------------------------ */
/* Priority scoring                                                    */
/* ------------------------------------------------------------------ */

export interface PriorityInput {
  amountBase: number;
  /** Hours until the current step's SLA expires. Negative = already overdue. */
  hoursToDue: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Blocking policy violation present. */
  hasBlockingViolation: boolean;
  requestType: string;
}

/**
 * Smart priority: an approver's queue should surface what matters, not just what
 * is oldest. Score is 0–100 and drives both the badge and the default inbox sort.
 */
export function scorePriority(input: PriorityInput): { score: number; priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' } {
  let score = 0;

  // Time pressure — the single strongest signal.
  if (input.hoursToDue !== null) {
    if (input.hoursToDue < 0) score += 45;
    else if (input.hoursToDue < 6) score += 32;
    else if (input.hoursToDue < 24) score += 18;
    else score += 6;
  }

  // Financial impact.
  const amt = input.amountBase;
  if (amt >= 5000) score += 28;
  else if (amt >= 2000) score += 20;
  else if (amt >= 500) score += 12;
  else if (amt > 0) score += 5;

  // Risk and policy.
  if (input.riskLevel === 'HIGH') score += 20;
  else if (input.riskLevel === 'MEDIUM') score += 10;
  if (input.hasBlockingViolation) score += 12;

  // Leave is time-sensitive for the team even when the amount is zero.
  if (input.requestType === 'LEAVE') score += 6;

  score = Math.min(100, score);
  const priority = score >= 70 ? 'CRITICAL' : score >= 48 ? 'HIGH' : score >= 22 ? 'NORMAL' : 'LOW';
  return { score, priority };
}
