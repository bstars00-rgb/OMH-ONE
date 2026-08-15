import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { budgets, expenseClaims, leaveBalances, leaveRequests, purchaseRequests, requests } from '@/lib/db/schema';
import type { Database } from '@/lib/db';

type Tx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface RequestForReservation {
  id: string;
  requestType: string;
  requesterId: string;
  departmentId: string | null;
  amountBase: string;
  /**
   * False when the amount is a reference figure rather than spend.
   *
   * A seal application carries the contract's value so it routes to the right
   * level of scrutiny, but signing a $120,000 contract does not spend $120,000
   * from this quarter's operating budget — committing it would exhaust a budget
   * an order of magnitude smaller. Optional so existing callers are unchanged;
   * absent means it commits, which is the behaviour every typed form wants.
   */
  commitsBudget?: boolean | null;
}

/**
 * Leave balance and budget move through three states in lockstep with approval:
 *
 *   submit   →  reserve()   pending / committed +=
 *   approve  →  commit()    pending → used, committed → spent
 *   reject   →  release()   pending / committed -=
 *   cancel   →  release()
 *
 * All three run inside the caller's transaction, so an aggregate can never
 * disagree with the request that produced it.
 */

function budgetCategory(requestType: string) {
  if (requestType === 'BUSINESS_TRIP' || requestType === 'EXPENSE') return 'TRAVEL';
  if (requestType === 'PURCHASE') return 'PROCUREMENT';
  return 'OPERATING';
}

async function findBudgetId(tx: Tx, req: RequestForReservation, at: Date): Promise<string | null> {
  if (!req.departmentId) return null;
  const year = at.getUTCFullYear();
  const quarter = Math.floor(at.getUTCMonth() / 3) + 1;
  const [row] = await tx
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(
        eq(budgets.departmentId, req.departmentId),
        eq(budgets.year, year),
        eq(budgets.quarter, quarter),
        eq(budgets.category, budgetCategory(req.requestType)),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function leaveDays(tx: Tx, requestId: string) {
  const [row] = await tx
    .select({ days: leaveRequests.workingDays, type: leaveRequests.leaveType, start: leaveRequests.startDate })
    .from(leaveRequests)
    .where(eq(leaveRequests.requestId, requestId))
    .limit(1);
  return row ?? null;
}

export async function reserve(tx: Tx, req: RequestForReservation, at = new Date()) {
  if (req.requestType === 'LEAVE') {
    const leave = await leaveDays(tx, req.id);
    if (!leave) return;
    await tx
      .update(leaveBalances)
      .set({ pending: sql`${leaveBalances.pending} + ${leave.days}`, updatedAt: new Date() })
      .where(
        and(
          eq(leaveBalances.employeeId, req.requesterId),
          eq(leaveBalances.year, Number(String(leave.start).slice(0, 4))),
          eq(leaveBalances.leaveType, leave.type),
        ),
      );
    return;
  }

  if (req.commitsBudget === false) return;

  const amount = Number(req.amountBase);
  if (amount <= 0) return;
  const budgetId = await findBudgetId(tx, req, at);
  if (!budgetId) return;
  await tx
    .update(budgets)
    .set({ committed: sql`${budgets.committed} + ${amount}`, updatedAt: new Date() })
    .where(eq(budgets.id, budgetId));
}

export async function release(tx: Tx, req: RequestForReservation, at = new Date()) {
  if (req.requestType === 'LEAVE') {
    const leave = await leaveDays(tx, req.id);
    if (!leave) return;
    await tx
      .update(leaveBalances)
      .set({ pending: sql`greatest(0, ${leaveBalances.pending} - ${leave.days})`, updatedAt: new Date() })
      .where(
        and(
          eq(leaveBalances.employeeId, req.requesterId),
          eq(leaveBalances.year, Number(String(leave.start).slice(0, 4))),
          eq(leaveBalances.leaveType, leave.type),
        ),
      );
    return;
  }

  if (req.commitsBudget === false) return;

  const amount = Number(req.amountBase);
  if (amount <= 0) return;
  const budgetId = await findBudgetId(tx, req, at);
  if (!budgetId) return;
  await tx
    .update(budgets)
    .set({ committed: sql`greatest(0, ${budgets.committed} - ${amount})`, updatedAt: new Date() })
    .where(eq(budgets.id, budgetId));
}

export async function commit(tx: Tx, req: RequestForReservation, at = new Date()) {
  if (req.requestType === 'LEAVE') {
    const leave = await leaveDays(tx, req.id);
    if (!leave) return;
    await tx
      .update(leaveBalances)
      .set({
        pending: sql`greatest(0, ${leaveBalances.pending} - ${leave.days})`,
        used: sql`${leaveBalances.used} + ${leave.days}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leaveBalances.employeeId, req.requesterId),
          eq(leaveBalances.year, Number(String(leave.start).slice(0, 4))),
          eq(leaveBalances.leaveType, leave.type),
        ),
      );
    return;
  }

  if (req.commitsBudget === false) return;

  const amount = Number(req.amountBase);
  if (amount > 0) {
    const budgetId = await findBudgetId(tx, req, at);
    if (budgetId) {
      await tx
        .update(budgets)
        .set({
          committed: sql`greatest(0, ${budgets.committed} - ${amount})`,
          spent: sql`${budgets.spent} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(budgets.id, budgetId));
    }
  }

  // An approved expense claim is payable from that moment.
  if (req.requestType === 'EXPENSE') {
    await tx.update(expenseClaims).set({ reimbursedAt: at }).where(eq(expenseClaims.requestId, req.id));
  }
}

/** Remaining budget for a department/category in the quarter containing `at`. */
export async function budgetPosition(tx: Tx, departmentId: string | null, requestType: string, at = new Date()) {
  if (!departmentId) return null;
  const [row] = await tx
    .select({
      id: budgets.id,
      allocated: budgets.allocated,
      committed: budgets.committed,
      spent: budgets.spent,
      category: budgets.category,
    })
    .from(budgets)
    .where(
      and(
        eq(budgets.departmentId, departmentId),
        eq(budgets.year, at.getUTCFullYear()),
        eq(budgets.quarter, Math.floor(at.getUTCMonth() / 3) + 1),
        eq(budgets.category, budgetCategory(requestType)),
      ),
    )
    .limit(1);
  if (!row) return null;
  const allocated = Number(row.allocated);
  const committed = Number(row.committed);
  const spent = Number(row.spent);
  return {
    id: row.id,
    category: row.category,
    allocated,
    committed,
    spent,
    remaining: allocated - committed - spent,
    utilization: allocated > 0 ? (committed + spent) / allocated : 0,
  };
}

export async function loadRequestForReservation(tx: Tx, requestId: string): Promise<RequestForReservation | null> {
  const [row] = await tx
    .select({
      id: requests.id,
      requestType: requests.requestType,
      requesterId: requests.requesterId,
      departmentId: requests.departmentId,
      amountBase: requests.amountBase,
      commitsBudget: requests.commitsBudget,
    })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  return row ?? null;
}

/** Quotation count, used by the PR two-quote policy. */
export async function quotationCount(tx: Tx, requestId: string) {
  const [row] = await tx
    .select({ n: purchaseRequests.quotationCount })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.requestId, requestId))
    .limit(1);
  return Number(row?.n ?? 0);
}
