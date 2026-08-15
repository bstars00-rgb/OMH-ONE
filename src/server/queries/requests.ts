import 'server-only';
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import {
  aiReviews,
  approvalActions,
  approvalSteps,
  attachments,
  businessTrips,
  comments,
  costCenters,
  departments,
  employees,
  expenseClaims,
  expenseItems,
  formTemplates,
  genericRequests,
  leaveRequests,
  purchaseItems,
  purchaseRequests,
  requests,
  tripCosts,
  tripTravelers,
  vendors,
} from '@/lib/db/schema';
import { canViewRequest, requestVisibility } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';
import type { TemplateField } from '@/lib/validation/templates';

/** Latest AI risk for a request, as a correlated scalar subquery. */
const latestRisk = sql<string>`(
  select ar.risk_level from ai_reviews ar
  where ar.request_id = ${requests.id}
  order by ar.created_at desc limit 1
)`;

export interface RequestFilters {
  mode?: 'inbox' | 'mine' | 'all';
  type?: string[];
  status?: string[];
  departmentId?: string;
  requesterId?: string;
  priority?: string[];
  risk?: string[];
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  q?: string;
  sort?: 'priority' | 'newest' | 'oldest' | 'amount' | 'sla';
  page?: number;
  pageSize?: number;
}

export interface RequestListRow {
  id: string;
  requestNumber: string;
  requestType: string;
  title: string;
  status: string;
  priority: string;
  priorityScore: number;
  amountBase: string;
  currency: string;
  submittedAt: Date | null;
  dueAt: Date | null;
  /** Hours until the current step's SLA expires; negative when overdue. Computed by the database. */
  hoursToDue: number | null;
  updatedAt: Date;
  requesterName: string;
  requesterId: string;
  departmentCode: string | null;
  currentApproverName: string | null;
  currentStepName: string | null;
  risk: string | null;
}

/** Requests where the caller is the approver of the *currently active* step. */
function inboxPredicate(session: SessionUser): SQL {
  return and(
    inArray(requests.status, ['SUBMITTED', 'IN_REVIEW']),
    exists(
      sql`(select 1 from approval_steps s
           where s.request_id = ${requests.id}
             and s.step_order = ${requests.currentStepOrder}
             and s.approver_id = ${session.employeeId}
             and s.status in ('PENDING','IN_REVIEW'))`,
    ),
  ) as SQL;
}

function buildWhere(session: SessionUser, f: RequestFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];

  if (f.mode === 'inbox') {
    clauses.push(inboxPredicate(session));
  } else if (f.mode === 'mine') {
    clauses.push(eq(requests.requesterId, session.employeeId));
  } else {
    // "All" is still bounded by what this role may read.
    clauses.push(requestVisibility(session));
    // Drafts are private to their author even for a director.
    clauses.push(
      or(sql`${requests.status} <> 'DRAFT'`, eq(requests.requesterId, session.employeeId)) as SQL,
    );
  }

  if (f.type?.length) clauses.push(inArray(requests.requestType, f.type));
  if (f.status?.length) clauses.push(inArray(requests.status, f.status));
  if (f.priority?.length) clauses.push(inArray(requests.priority, f.priority));
  if (f.departmentId) clauses.push(eq(requests.departmentId, f.departmentId));
  if (f.requesterId) clauses.push(eq(requests.requesterId, f.requesterId));
  if (f.from) clauses.push(gte(requests.submittedAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) clauses.push(lte(requests.submittedAt, new Date(`${f.to}T23:59:59Z`)));
  if (f.minAmount !== undefined) clauses.push(gte(requests.amountBase, String(f.minAmount)));
  if (f.maxAmount !== undefined) clauses.push(lte(requests.amountBase, String(f.maxAmount)));
  if (f.risk?.length) clauses.push(sql`${latestRisk} in (${sql.join(f.risk.map((r) => sql`${r}`), sql`, `)})`);
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    clauses.push(or(ilike(requests.title, like), ilike(requests.requestNumber, like), ilike(requests.description, like)));
  }

  const defined = clauses.filter(Boolean) as SQL[];
  return defined.length ? and(...defined) : undefined;
}

function orderFor(sort: RequestFilters['sort']) {
  switch (sort) {
    case 'newest':
      return [desc(sql`coalesce(${requests.submittedAt}, ${requests.createdAt})`)];
    case 'oldest':
      return [asc(sql`coalesce(${requests.submittedAt}, ${requests.createdAt})`)];
    case 'amount':
      return [desc(requests.amountBase)];
    case 'sla':
      return [sql`${requests.dueAt} asc nulls last`];
    case 'priority':
    default:
      // Smart default: what matters, then what is closest to breaching, then age.
      return [desc(requests.priorityScore), sql`${requests.dueAt} asc nulls last`, asc(requests.submittedAt)];
  }
}

export async function listRequests(session: SessionUser, filters: RequestFilters) {
  const db = await ready();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const where = buildWhere(session, filters);

  const approver = { ...employees };

  const rows = await db
    .select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      requestType: requests.requestType,
      title: requests.title,
      status: requests.status,
      priority: requests.priority,
      priorityScore: requests.priorityScore,
      amountBase: requests.amountBase,
      currency: requests.currency,
      submittedAt: requests.submittedAt,
      dueAt: requests.dueAt,
      hoursToDue: sql<number | null>`case when ${requests.dueAt} is null then null
        else round((extract(epoch from (${requests.dueAt} - now())) / 3600)::numeric, 2) end`,
      updatedAt: requests.updatedAt,
      requesterName: employees.name,
      requesterId: requests.requesterId,
      departmentCode: departments.code,
      currentApproverName: sql<string | null>`(
        select e.name from approval_steps s
        join employees e on e.id = s.approver_id
        where s.request_id = ${requests.id} and s.step_order = ${requests.currentStepOrder}
        limit 1
      )`,
      currentStepName: sql<string | null>`(
        select s.name from approval_steps s
        where s.request_id = ${requests.id} and s.step_order = ${requests.currentStepOrder}
        limit 1
      )`,
      risk: latestRisk,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .leftJoin(departments, eq(departments.id, requests.departmentId))
    .where(where)
    .orderBy(...orderFor(filters.sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .where(where);

  void approver;
  return { rows: rows as RequestListRow[], total: Number(total), page, pageSize };
}

/** Status counts for tab badges, using the same visibility rules as the list. */
export async function countByStatus(session: SessionUser, filters: RequestFilters) {
  const db = await ready();
  const where = buildWhere(session, { ...filters, status: undefined });
  const rows = await db
    .select({ status: requests.status, n: count() })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .where(where)
    .groupBy(requests.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export interface RequestDetail {
  request: typeof requests.$inferSelect;
  requester: { id: string; name: string; email: string; position: string | null; departmentCode: string | null; managerName: string | null };
  departmentName: string | null;
  costCenter: string | null;
  steps: (typeof approvalSteps.$inferSelect & {
    approverName: string | null;
    approverPosition: string | null;
    isOverdue: boolean;
  })[];
  actions: (typeof approvalActions.$inferSelect & { approverName: string | null })[];
  comments: (typeof comments.$inferSelect & { authorName: string | null })[];
  attachments: (typeof attachments.$inferSelect)[];
  leave: typeof leaveRequests.$inferSelect | null;
  trip:
    | (typeof businessTrips.$inferSelect & {
        travelers: { id: string; name: string; isLead: boolean; position: string | null }[];
        costs: (typeof tripCosts.$inferSelect)[];
      })
    | null;
  purchase: (typeof purchaseRequests.$inferSelect & { vendorName: string | null; items: (typeof purchaseItems.$inferSelect)[] }) | null;
  expense: (typeof expenseClaims.$inferSelect & { items: (typeof expenseItems.$inferSelect)[]; linkedTripNumber: string | null }) | null;
  generic: typeof genericRequests.$inferSelect | null;
  /**
   * The form template this request was filed on, when it came from one.
   *
   * Carried into the detail view because otherwise an approver sees a title and
   * a paragraph and none of the structured fields the requester filled in —
   * which is most of the document.
   */
  template: { nameEn: string; nameKo: string; fields: TemplateField[] } | null;
  currentStep: (typeof approvalSteps.$inferSelect) | null;
}

export async function getRequestDetail(session: SessionUser, id: string): Promise<RequestDetail | null | 'FORBIDDEN'> {
  const db = await ready();

  const [row] = await db
    .select({
      request: requests,
      requesterName: employees.name,
      requesterEmail: employees.email,
      requesterPosition: employees.position,
      requesterManagerId: employees.managerId,
      departmentCode: departments.code,
      departmentName: departments.name,
      costCenter: costCenters.name,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .leftJoin(departments, eq(departments.id, requests.departmentId))
    .leftJoin(costCenters, eq(costCenters.id, requests.costCenterId))
    .where(eq(requests.id, id))
    .limit(1);

  if (!row) return null;

  const stepRows = await db
    .select({
      step: approvalSteps,
      approverName: employees.name,
      approverPosition: employees.position,
      // Overdue is decided by the database clock, not by the renderer.
      isOverdue: sql<boolean>`(${approvalSteps.dueAt} is not null and ${approvalSteps.completedAt} is null and ${approvalSteps.dueAt} < now())`,
    })
    .from(approvalSteps)
    .leftJoin(employees, eq(employees.id, approvalSteps.approverId))
    .where(eq(approvalSteps.requestId, id))
    .orderBy(asc(approvalSteps.stepOrder));

  // Authorization happens after the fetch but before anything is returned, so a
  // guessed URL yields the same 403 as a guessed id that does not exist.
  const approverIds = stepRows.map((s) => s.step.approverId).filter(Boolean) as string[];
  if (!canViewRequest(session, row.request, approverIds)) return 'FORBIDDEN';
  if (row.request.status === 'DRAFT' && row.request.requesterId !== session.employeeId) return 'FORBIDDEN';

  const [managerRow] = row.requesterManagerId
    ? await db.select({ name: employees.name }).from(employees).where(eq(employees.id, row.requesterManagerId)).limit(1)
    : [undefined];

  const [actionRows, commentRows, attachmentRows] = await Promise.all([
    db
      .select({ action: approvalActions, approverName: employees.name })
      .from(approvalActions)
      .leftJoin(employees, eq(employees.id, approvalActions.approverId))
      .where(eq(approvalActions.requestId, id))
      .orderBy(asc(approvalActions.actionAt)),
    db
      .select({ comment: comments, authorName: employees.name })
      .from(comments)
      .leftJoin(employees, eq(employees.id, comments.authorId))
      .where(eq(comments.requestId, id))
      .orderBy(asc(comments.createdAt)),
    db.select().from(attachments).where(eq(attachments.requestId, id)).orderBy(asc(attachments.createdAt)),
  ]);

  const detail: RequestDetail = {
    request: row.request,
    requester: {
      id: row.request.requesterId,
      name: row.requesterName,
      email: row.requesterEmail,
      position: row.requesterPosition,
      departmentCode: row.departmentCode,
      managerName: managerRow?.name ?? null,
    },
    departmentName: row.departmentName,
    costCenter: row.costCenter,
    steps: stepRows.map((s) => ({
      ...s.step,
      approverName: s.approverName,
      approverPosition: s.approverPosition,
      isOverdue: Boolean(s.isOverdue),
    })),
    actions: actionRows.map((a) => ({ ...a.action, approverName: a.approverName })),
    comments: commentRows.map((c) => ({ ...c.comment, authorName: c.authorName })),
    attachments: attachmentRows,
    leave: null,
    trip: null,
    purchase: null,
    expense: null,
    generic: null,
    template: null,
    currentStep: null,
  };

  detail.currentStep = detail.steps.find((s) => s.stepOrder === row.request.currentStepOrder) ?? null;

  switch (row.request.requestType) {
    case 'LEAVE': {
      const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.requestId, id)).limit(1);
      detail.leave = l ?? null;
      break;
    }
    case 'BUSINESS_TRIP': {
      const [t] = await db.select().from(businessTrips).where(eq(businessTrips.requestId, id)).limit(1);
      if (t) {
        const [travelers, costs] = await Promise.all([
          db
            .select({ id: employees.id, name: employees.name, isLead: tripTravelers.isLead, position: employees.position })
            .from(tripTravelers)
            .innerJoin(employees, eq(employees.id, tripTravelers.employeeId))
            .where(eq(tripTravelers.tripId, t.id))
            .orderBy(desc(tripTravelers.isLead)),
          db.select().from(tripCosts).where(eq(tripCosts.tripId, t.id)),
        ]);
        detail.trip = { ...t, travelers, costs };
      }
      break;
    }
    case 'PURCHASE': {
      const [p] = await db
        .select({ pr: purchaseRequests, vendorName: vendors.name })
        .from(purchaseRequests)
        .leftJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
        .where(eq(purchaseRequests.requestId, id))
        .limit(1);
      if (p) {
        const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseRequestId, p.pr.id));
        detail.purchase = { ...p.pr, vendorName: p.vendorName, items };
      }
      break;
    }
    case 'EXPENSE': {
      const [c] = await db.select().from(expenseClaims).where(eq(expenseClaims.requestId, id)).limit(1);
      if (c) {
        const items = await db
          .select()
          .from(expenseItems)
          .where(eq(expenseItems.claimId, c.id))
          .orderBy(asc(expenseItems.expenseDate));
        let linkedTripNumber: string | null = null;
        if (c.tripRequestId) {
          const [t] = await db
            .select({ n: requests.requestNumber })
            .from(requests)
            .where(eq(requests.id, c.tripRequestId))
            .limit(1);
          linkedTripNumber = t?.n ?? null;
        }
        detail.expense = { ...c, items, linkedTripNumber };
      }
      break;
    }
    default: {
      const [g] = await db.select().from(genericRequests).where(eq(genericRequests.requestId, id)).limit(1);
      detail.generic = g ?? null;

      if (row.request.templateId) {
        const [tpl] = await db
          .select({ nameEn: formTemplates.nameEn, nameKo: formTemplates.nameKo, fields: formTemplates.fields })
          .from(formTemplates)
          .where(eq(formTemplates.id, row.request.templateId))
          .limit(1);
        detail.template = tpl ? { nameEn: tpl.nameEn, nameKo: tpl.nameKo, fields: tpl.fields as TemplateField[] } : null;
      }
    }
  }

  return detail;
}

/** Latest cached AI review for a request, if one exists. */
export async function getAiReview(requestId: string) {
  const db = await ready();
  const [row] = await db
    .select()
    .from(aiReviews)
    .where(eq(aiReviews.requestId, requestId))
    .orderBy(desc(aiReviews.createdAt))
    .limit(1);
  return row ?? null;
}
