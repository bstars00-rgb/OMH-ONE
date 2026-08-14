import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import {
  approvalActions,
  approvalSteps,
  approvalWorkflowSteps,
  approvalWorkflows,
  businessTrips,
  comments,
  departments,
  employees,
  leaveRequests,
  notifications,
  purchaseRequests,
  requests,
} from '@/lib/db/schema';
import {
  canTransition,
  materializeSteps,
  scorePriority,
  WorkflowError,
  type ApprovalAction,
  type RequestFacts,
} from '@/lib/workflow/engine';
import { canActOnStep, canCancelRequest, PermissionError } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import { recordAudit } from '@/server/audit';
import { commit, loadRequestForReservation, release, reserve } from './reservations';
import type { Database } from '@/lib/db';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/* ------------------------------------------------------------------ */
/* Facts + approver directory                                          */
/* ------------------------------------------------------------------ */

async function gatherFacts(tx: Tx, requestId: string, requestType: string, amountBase: number): Promise<RequestFacts> {
  const facts: RequestFacts = { amountBase, isInternational: false, days: 0, quotationCount: 0 };

  if (requestType === 'BUSINESS_TRIP') {
    const [t] = await tx
      .select({ intl: businessTrips.isInternational, days: businessTrips.durationDays })
      .from(businessTrips)
      .where(eq(businessTrips.requestId, requestId))
      .limit(1);
    if (t) {
      facts.isInternational = t.intl;
      facts.days = t.days;
    }
  } else if (requestType === 'LEAVE') {
    const [l] = await tx
      .select({ days: leaveRequests.workingDays })
      .from(leaveRequests)
      .where(eq(leaveRequests.requestId, requestId))
      .limit(1);
    if (l) facts.days = Number(l.days);
  } else if (requestType === 'PURCHASE') {
    const [p] = await tx
      .select({ q: purchaseRequests.quotationCount })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestId, requestId))
      .limit(1);
    if (p) facts.quotationCount = Number(p.q);
  }

  return facts;
}

async function approverDirectory(tx: Tx, requesterId: string) {
  const [requester] = await tx
    .select({
      id: employees.id,
      managerId: employees.managerId,
      departmentId: employees.departmentId,
    })
    .from(employees)
    .where(eq(employees.id, requesterId))
    .limit(1);
  if (!requester) throw new WorkflowError('Requester not found.');

  const [dept] = requester.departmentId
    ? await tx
        .select({ head: departments.headEmployeeId })
        .from(departments)
        .where(eq(departments.id, requester.departmentId))
        .limit(1)
    : [undefined];

  // Role holders are resolved from the org, not hard-coded ids.
  const roleHolder = async (deptCode: string) => {
    const [row] = await tx
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(departments.code, deptCode), eq(employees.id, departments.headEmployeeId)))
      .limit(1);
    return row?.id ?? null;
  };

  const [hrId, financeId, directorId] = await Promise.all([roleHolder('HR'), roleHolder('FIN'), roleHolder('CEO')]);

  return {
    requesterId,
    managerId: requester.managerId,
    deptHeadId: dept?.head ?? null,
    hrId,
    financeId,
    directorId,
  };
}

/* ------------------------------------------------------------------ */
/* Submit                                                              */
/* ------------------------------------------------------------------ */

export async function submitRequest(session: SessionUser, requestId: string) {
  const db = await ready();

  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1).for('update');
    if (!req) throw new WorkflowError('Request not found.');
    if (req.requesterId !== session.employeeId) throw new PermissionError('Only the requester can submit this request.');
    if (!canTransition('SUBMIT', req.status as never)) {
      throw new WorkflowError(`A request with status ${req.status} cannot be submitted.`);
    }

    const amountBase = Number(req.amountBase);
    const facts = await gatherFacts(tx, requestId, req.requestType, amountBase);
    const dir = await approverDirectory(tx, req.requesterId);

    const [workflow] = await tx
      .select({ id: approvalWorkflows.id })
      .from(approvalWorkflows)
      .where(and(eq(approvalWorkflows.requestType, req.requestType), eq(approvalWorkflows.isActive, true)))
      .orderBy(sql`${approvalWorkflows.isDefault} desc`)
      .limit(1);
    if (!workflow) throw new WorkflowError(`No active approval workflow is configured for ${req.requestType}.`);

    const templates = await tx
      .select()
      .from(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.workflowId, workflow.id))
      .orderBy(asc(approvalWorkflowSteps.stepOrder));

    const chain = materializeSteps(
      templates.map((t) => ({
        stepOrder: t.stepOrder,
        name: t.name,
        approverRole: t.approverRole,
        slaHours: t.slaHours,
        conditionType: t.conditionType,
        conditionValue: t.conditionValue,
      })),
      facts,
      dir,
    );

    if (chain.length === 0) {
      throw new WorkflowError(
        'No approver could be resolved for this request. Check that your manager and department head are set.',
      );
    }

    // Resubmitting a RETURNED request rebuilds the chain from step 1; the prior
    // attempt stays in approval_actions, so the history is not lost.
    await tx.delete(approvalSteps).where(eq(approvalSteps.requestId, requestId));

    const now = new Date();
    const firstDue = new Date(now.getTime() + chain[0].slaHours * 3_600_000);

    await tx.insert(approvalSteps).values(
      chain.map((s, i) => ({
        requestId,
        stepOrder: s.stepOrder,
        name: s.name,
        approverRole: s.approverRole,
        approverId: s.approverId,
        status: 'PENDING',
        slaHours: s.slaHours,
        dueAt: i === 0 ? firstDue : null,
        startedAt: i === 0 ? now : null,
      })),
    );

    const { score, priority } = scorePriority({
      amountBase,
      hoursToDue: chain[0].slaHours,
      riskLevel: 'LOW',
      hasBlockingViolation: false,
      requestType: req.requestType,
    });

    await tx
      .update(requests)
      .set({
        status: 'SUBMITTED',
        submittedAt: now,
        decidedAt: null,
        currentStepOrder: 1,
        workflowId: workflow.id,
        dueAt: firstDue,
        priority,
        priorityScore: score,
        updatedAt: now,
      })
      .where(eq(requests.id, requestId));

    await tx.insert(approvalActions).values({
      requestId,
      stepId: null,
      approverId: session.employeeId,
      action: 'SUBMIT',
      comment: null,
      actionAt: now,
    });

    const forReservation = await loadRequestForReservation(tx, requestId);
    if (forReservation) await reserve(tx, forReservation, now);

    if (chain[0].approverId) {
      await tx.insert(notifications).values({
        employeeId: chain[0].approverId,
        type: 'APPROVAL_REQUIRED',
        title: `Approval required — ${req.requestNumber}`,
        body: `${session.name} submitted “${req.title}” for your review.`,
        requestId,
        severity: amountBase >= 2000 ? 'WARNING' : 'INFO',
      });
    }

    await recordAudit(tx as unknown as Database, {
      action: 'SUBMIT',
      entityType: 'request',
      entityId: requestId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${req.requestNumber} submitted — ${req.title}`,
      metadata: { steps: chain.map((c) => c.name), amountBase },
    });

    return { requestNumber: req.requestNumber, steps: chain.length };
  });
}

/* ------------------------------------------------------------------ */
/* Decide (approve / reject / return)                                  */
/* ------------------------------------------------------------------ */

export interface DecisionResult {
  status: string;
  requestNumber: string;
  message: string;
}

export async function decideRequest(
  session: SessionUser,
  requestId: string,
  action: Extract<ApprovalAction, 'APPROVE' | 'REJECT' | 'RETURN'>,
  comment?: string | null,
): Promise<DecisionResult> {
  if ((action === 'REJECT' || action === 'RETURN') && !comment?.trim()) {
    throw new WorkflowError(
      action === 'REJECT'
        ? 'A reason is required when rejecting a request.'
        : 'Explain what needs to change before returning the request.',
    );
  }

  const db = await ready();

  return db.transaction(async (tx) => {
    // Row lock: two approvers clicking at the same moment must not both win.
    const [req] = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1).for('update');
    if (!req) throw new WorkflowError('Request not found.');
    if (!canTransition(action, req.status as never)) {
      throw new WorkflowError('This request has already been decided.');
    }

    const [step] = await tx
      .select()
      .from(approvalSteps)
      .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.stepOrder, req.currentStepOrder)))
      .limit(1);

    if (!step) throw new WorkflowError('No approval step is awaiting a decision.');
    if (!canActOnStep(session, step)) {
      await recordAudit(tx as unknown as Database, {
        action: 'PERMISSION_DENIED',
        entityType: 'request',
        entityId: requestId,
        actorId: session.employeeId,
        actorEmail: session.email,
        summary: `Attempted ${action} on ${req.requestNumber} without authority`,
      });
      throw new PermissionError('You are not the approver for the current step of this request.');
    }

    const now = new Date();
    const isDelegated = step.approverId !== session.employeeId;

    await tx
      .update(approvalSteps)
      .set({
        status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED',
        completedAt: now,
      })
      .where(eq(approvalSteps.id, step.id));

    await tx.insert(approvalActions).values({
      requestId,
      stepId: step.id,
      approverId: session.employeeId,
      action,
      comment: comment?.trim() || null,
      actionAt: now,
    });

    const forReservation = await loadRequestForReservation(tx, requestId);
    let status = req.status;
    let message = '';

    if (action === 'APPROVE') {
      const [next] = await tx
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.stepOrder, step.stepOrder + 1)))
        .limit(1);

      if (next) {
        const dueAt = new Date(now.getTime() + next.slaHours * 3_600_000);
        await tx
          .update(approvalSteps)
          .set({ startedAt: now, dueAt, status: 'PENDING' })
          .where(eq(approvalSteps.id, next.id));
        await tx
          .update(requests)
          .set({ status: 'IN_REVIEW', currentStepOrder: next.stepOrder, dueAt, updatedAt: now })
          .where(eq(requests.id, requestId));
        status = 'IN_REVIEW';
        message = `Approved. Sent to ${next.name}.`;

        if (next.approverId) {
          await tx.insert(notifications).values({
            employeeId: next.approverId,
            type: 'APPROVAL_REQUIRED',
            title: `Approval required — ${req.requestNumber}`,
            body: `${session.name} approved the previous step. It is now with you.`,
            requestId,
            severity: Number(req.amountBase) >= 2000 ? 'WARNING' : 'INFO',
          });
        }
      } else {
        await tx
          .update(requests)
          .set({ status: 'APPROVED', decidedAt: now, dueAt: null, updatedAt: now })
          .where(eq(requests.id, requestId));
        if (forReservation) await commit(tx, forReservation, now);
        status = 'APPROVED';
        message = 'Approved. This was the final step.';

        await tx.insert(notifications).values({
          employeeId: req.requesterId,
          type: 'REQUEST_APPROVED',
          title: `Approved — ${req.requestNumber}`,
          body: 'Your request has completed all approval steps.',
          requestId,
          severity: 'INFO',
        });
      }
    } else if (action === 'REJECT') {
      await tx
        .update(approvalSteps)
        .set({ status: 'SKIPPED' })
        .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.status, 'PENDING')));
      await tx
        .update(requests)
        .set({ status: 'REJECTED', decidedAt: now, dueAt: null, updatedAt: now })
        .where(eq(requests.id, requestId));
      if (forReservation) await release(tx, forReservation, now);
      status = 'REJECTED';
      message = 'Request rejected. The requester has been notified.';

      await tx.insert(notifications).values({
        employeeId: req.requesterId,
        type: 'REQUEST_REJECTED',
        title: `Rejected — ${req.requestNumber}`,
        body: comment?.trim() || 'Your request was declined.',
        requestId,
        severity: 'WARNING',
      });
    } else {
      await tx
        .update(approvalSteps)
        .set({ status: 'SKIPPED' })
        .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.status, 'PENDING')));
      await tx
        .update(requests)
        .set({ status: 'RETURNED', dueAt: null, updatedAt: now })
        .where(eq(requests.id, requestId));
      if (forReservation) await release(tx, forReservation, now);
      status = 'RETURNED';
      message = 'Returned to the requester for correction.';

      await tx.insert(notifications).values({
        employeeId: req.requesterId,
        type: 'REQUEST_RETURNED',
        title: `Returned for correction — ${req.requestNumber}`,
        body: comment?.trim() || 'An approver asked for changes.',
        requestId,
        severity: 'WARNING',
      });
    }

    await recordAudit(tx as unknown as Database, {
      action,
      entityType: 'request',
      entityId: requestId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${req.requestNumber} ${action.toLowerCase()}d at step ${step.stepOrder} (${step.name})`,
      metadata: { comment: comment ?? null, delegated: isDelegated, resultingStatus: status },
    });

    return { status, requestNumber: req.requestNumber, message };
  });
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export async function cancelRequest(session: SessionUser, requestId: string, reason?: string) {
  const db = await ready();

  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1).for('update');
    if (!req) throw new WorkflowError('Request not found.');
    if (!canCancelRequest(session, req)) {
      throw new PermissionError('Only the requester can cancel this request, and only before it is decided.');
    }
    if (!canTransition('CANCEL', req.status as never)) {
      throw new WorkflowError(`A request with status ${req.status} cannot be canceled.`);
    }

    const now = new Date();
    const wasSubmitted = req.status !== 'DRAFT';

    await tx
      .update(approvalSteps)
      .set({ status: 'SKIPPED' })
      .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.status, 'PENDING')));
    await tx
      .update(requests)
      .set({ status: 'CANCELED', decidedAt: now, dueAt: null, updatedAt: now })
      .where(eq(requests.id, requestId));

    await tx.insert(approvalActions).values({
      requestId,
      stepId: null,
      approverId: session.employeeId,
      action: 'CANCEL',
      comment: reason?.trim() || null,
      actionAt: now,
    });

    if (wasSubmitted) {
      const forReservation = await loadRequestForReservation(tx, requestId);
      if (forReservation) await release(tx, forReservation, now);

      // Tell whoever was holding it that they no longer need to act.
      const pendingApprovers = await tx
        .select({ approverId: approvalSteps.approverId })
        .from(approvalSteps)
        .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.status, 'SKIPPED')));
      const unique = [...new Set(pendingApprovers.map((p) => p.approverId).filter(Boolean))] as string[];
      if (unique.length) {
        await tx.insert(notifications).values(
          unique.map((approverId) => ({
            employeeId: approverId,
            type: 'REQUEST_CANCELED',
            title: `Withdrawn — ${req.requestNumber}`,
            body: `${session.name} withdrew this request. No action needed.`,
            requestId,
            severity: 'INFO',
          })),
        );
      }
    }

    await recordAudit(tx as unknown as Database, {
      action: 'CANCEL',
      entityType: 'request',
      entityId: requestId,
      actorId: session.employeeId,
      actorEmail: session.email,
      summary: `${req.requestNumber} withdrawn by requester`,
      metadata: { reason: reason ?? null },
    });

    return { requestNumber: req.requestNumber };
  });
}

/* ------------------------------------------------------------------ */
/* Ancillary                                                           */
/* ------------------------------------------------------------------ */

/** Marks the active step as opened, so "In review" reflects reality. Idempotent. */
export async function markStepInReview(session: SessionUser, requestId: string) {
  const db = await ready();
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!req || req.status !== 'SUBMITTED') return;

  const [step] = await db
    .select()
    .from(approvalSteps)
    .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.stepOrder, req.currentStepOrder)))
    .limit(1);
  if (!step || step.approverId !== session.employeeId || step.status !== 'PENDING') return;

  await db.update(approvalSteps).set({ status: 'IN_REVIEW' }).where(eq(approvalSteps.id, step.id));
  await db.update(requests).set({ status: 'IN_REVIEW', updatedAt: new Date() }).where(eq(requests.id, requestId));
  await db.insert(approvalActions).values({
    requestId,
    stepId: step.id,
    approverId: session.employeeId,
    action: 'VIEW',
    comment: null,
  });
}

export async function addComment(session: SessionUser, requestId: string, body: string, mentions: string[] = []) {
  const trimmed = body.trim();
  if (!trimmed) throw new WorkflowError('Comment cannot be empty.');
  if (trimmed.length > 4000) throw new WorkflowError('Comment is too long (4,000 characters maximum).');

  const db = await ready();
  await db.insert(comments).values({
    requestId,
    authorId: session.employeeId,
    authorType: 'USER',
    body: trimmed,
    mentions,
  });

  // Notify the requester and any mentioned employees, but never yourself.
  const [req] = await db
    .select({ requesterId: requests.requesterId, number: requests.requestNumber })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);

  const targets = new Set<string>(mentions);
  if (req && req.requesterId !== session.employeeId) targets.add(req.requesterId);
  targets.delete(session.employeeId);

  if (targets.size && req) {
    await db.insert(notifications).values(
      [...targets].map((employeeId) => ({
        employeeId,
        type: 'COMMENT',
        title: `New comment — ${req.number}`,
        body: `${session.name}: ${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}`,
        requestId,
        severity: 'INFO',
      })),
    );
  }
}
