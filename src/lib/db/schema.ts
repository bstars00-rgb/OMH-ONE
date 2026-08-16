/**
 * OHMY AI ERP — Relational schema (PostgreSQL)
 *
 * One schema, two runtimes:
 *   - local demo  : PGlite (Postgres compiled to WASM, persisted to ./.pgdata)
 *   - production  : Supabase Postgres / any Postgres 14+
 *
 * Design notes
 *  - `requests` is the universal base table. Every approvable object (leave, trip,
 *    purchase, expense, HR, general) owns a row here and a row in its detail table.
 *    That is what makes the approval engine, inbox, audit log, comments, attachments
 *    and analytics type-agnostic.
 *  - Money is stored as numeric(14,2) in BOTH the original currency and the company
 *    base currency, with the rate used at capture time, so historical reports do not
 *    drift when FX changes.
 *  - Enum-ish columns are `text` + a CHECK-free application-level union type. Keeping
 *    them text avoids destructive ALTER TYPE migrations as the product grows.
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  numeric,
  boolean,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Organization                                                        */
/* ------------------------------------------------------------------ */

export const offices = pgTable('offices', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  city: text('city').notNull(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  baseCurrency: text('base_currency').notNull().default('USD'),
  createdAt: createdAt(),
});

export const departments = pgTable('departments', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  officeId: uuid('office_id').references(() => offices.id),
  headEmployeeId: uuid('head_employee_id'),
  createdAt: createdAt(),
});

export const teams = pgTable('teams', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  departmentId: uuid('department_id')
    .notNull()
    .references(() => departments.id),
  createdAt: createdAt(),
});

export const costCenters = pgTable('cost_centers', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  departmentId: uuid('department_id').references(() => departments.id),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* People & access                                                     */
/* ------------------------------------------------------------------ */

export const employees = pgTable(
  'employees',
  {
    id: id(),
    employeeCode: text('employee_code').notNull().unique(),
    name: text('name').notNull(),
    englishName: text('english_name'),
    email: text('email').notNull().unique(),
    departmentId: uuid('department_id').references(() => departments.id),
    teamId: uuid('team_id').references(() => teams.id),
    officeId: uuid('office_id').references(() => offices.id),
    position: text('position'),
    managerId: uuid('manager_id'),
    employmentType: text('employment_type').notNull().default('FULL_TIME'),
    joinDate: date('join_date').notNull(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | ON_LEAVE | RESIGNED
    annualLeaveAllowance: numeric('annual_leave_allowance', { precision: 5, scale: 1 })
      .notNull()
      .default('15.0'),
    phone: text('phone'),
    avatarColor: text('avatar_color'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('employees_department_idx').on(t.departmentId), index('employees_manager_idx').on(t.managerId)],
);

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  primaryRole: text('primary_role').notNull().default('EMPLOYEE'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** Multi-role support: a user may be MANAGER *and* FINANCE. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/* ------------------------------------------------------------------ */
/* Universal request + approval engine                                 */
/* ------------------------------------------------------------------ */

export const requests = pgTable(
  'requests',
  {
    id: id(),
    requestNumber: text('request_number').notNull().unique(), // BT-2026-00001
    requestType: text('request_type').notNull(), // LEAVE | BUSINESS_TRIP | PURCHASE | EXPENSE | HR | GENERAL
    title: text('title').notNull(),
    description: text('description'),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => employees.id),
    departmentId: uuid('department_id').references(() => departments.id),
    /**
     * The office that raised the request — the tenant boundary.
     *
     * Denormalized from the requester at creation rather than joined, because it
     * is filtered on by every list, aggregate and export. Requests stay with the
     * office that filed them even if the person later transfers.
     */
    officeId: uuid('office_id').references(() => offices.id),
    costCenterId: uuid('cost_center_id').references(() => costCenters.id),
    status: text('status').notNull().default('DRAFT'),
    priority: text('priority').notNull().default('NORMAL'), // CRITICAL | HIGH | NORMAL | LOW
    priorityScore: integer('priority_score').notNull().default(0),
    workflowId: uuid('workflow_id'),
    /**
     * Set when this request came from a form template rather than one of the
     * built-in typed forms. `values` then holds the submitted fields, keyed by
     * the template's field keys.
     *
     * Typed requests (leave, trip, purchase, expense) keep their own detail
     * tables: their fields carry real logic — working-day arithmetic, budget
     * reservation, duplicate hashing — that a JSON blob cannot express. The
     * template path serves the long tail of forms that are structured text plus
     * an approval route, which is most of what a company actually files.
     */
    templateId: uuid('template_id'),
    values: jsonb('values').$type<Record<string, unknown>>(),
    /**
     * Whether this request reserves budget on submission.
     *
     * Stored per row rather than read from the template at reservation time, so
     * changing a template later cannot retroactively commit or release money
     * against requests already in flight.
     */
    commitsBudget: boolean('commits_budget').notNull().default(true),
    currentStepOrder: integer('current_step_order').notNull().default(0),
    amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
    amountOriginal: numeric('amount_original', { precision: 14, scale: 2 }).notNull().default('0'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('requests_status_idx').on(t.status),
    index('requests_type_idx').on(t.requestType),
    index('requests_requester_idx').on(t.requesterId),
    index('requests_department_idx').on(t.departmentId),
    index('requests_office_idx').on(t.officeId),
    index('requests_template_idx').on(t.templateId),
    index('requests_submitted_idx').on(t.submittedAt),
  ],
);

/**
 * A form template: the shape of a request, stored as data.
 *
 * The company this is built for runs ~23 form templates across its Korean,
 * Japanese, Singapore and Chinese offices — 押印申請, 出張伺書, 인수인계서,
 * 사직서 and so on. None of those exist in any packaged ERP, and each new one
 * cannot mean a developer ticket. So the shape is a row, the fields are JSON,
 * and an administrator (helped by AI) authors them.
 *
 * `titlePattern` replaces the naming convention those companies otherwise cram
 * into the document title — "[Ohmy_JP]_YYYY/MM/DD-YYYY/MM/DD_place_出張伺書_name"
 * is a filename doing a database's job. Here the title is generated from the
 * fields, so nobody has to remember the format.
 */
export const formTemplates = pgTable(
  'form_templates',
  {
    id: id(),
    code: text('code').notNull().unique(), // JP-SEAL-SALES
    nameEn: text('name_en').notNull(),
    nameKo: text('name_ko').notNull(),
    descriptionEn: text('description_en'),
    descriptionKo: text('description_ko'),
    /** Null means every office may use it. */
    officeId: uuid('office_id').references(() => offices.id, { onDelete: 'cascade' }),
    /** Groups the picker: HR | FINANCE | TRAVEL | DOCUMENT | GENERAL */
    category: text('category').notNull().default('GENERAL'),
    icon: text('icon').notNull().default('FileText'),
    /**
     * Field definitions, in display order. Validated by `templateFieldsSchema`
     * in `src/lib/validation/templates.ts` on every write, so a malformed
     * template cannot reach the renderer.
     */
    fields: jsonb('fields')
      .$type<
        {
          key: string;
          labelEn: string;
          labelKo: string;
          type: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'employee';
          required?: boolean;
          options?: { value: string; labelEn: string; labelKo: string }[];
          hintEn?: string;
          hintKo?: string;
        }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * Search synonyms in every language the company files in.
     *
     * Staff say "도장", the form is called "날인 신청서"; they say "송금", the
     * form is "T/R". No deterministic matcher bridges that, and hand-listing
     * synonyms cannot scale to forms an administrator writes next month — so
     * the AI generator produces them at authoring time, once, instead of the
     * router guessing at query time, every time.
     */
    keywords: jsonb('keywords')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** e.g. "출장 {city} {startDate}" — placeholders are field keys. */
    titlePattern: text('title_pattern').notNull().default(''),
    /** Field key holding the amount, if this template carries one. Drives routing and display. */
    amountField: text('amount_field'),
    /**
     * Whether that amount is money leaving this quarter's budget.
     *
     * A seal application on a $120,000 contract needs executive scrutiny, but
     * signing the contract is not spending $120,000 now — committing it would
     * wipe out an operating budget an order of magnitude smaller. So the amount
     * always drives routing and display; this decides whether it also reserves.
     */
    amountCommitsBudget: boolean('amount_commits_budget').notNull().default(true),
    /** Explicit route; null falls back to the GENERAL workflow. */
    workflowId: uuid('workflow_id'),
    isActive: boolean('is_active').notNull().default(true),
    /** Marks templates authored by the AI generator rather than seeded. */
    createdByAi: boolean('created_by_ai').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('form_templates_office_idx').on(t.officeId),
    index('form_templates_category_idx').on(t.category),
  ],
);

/** Admin-configurable route per request type. */
export const approvalWorkflows = pgTable('approval_workflows', {
  id: id(),
  name: text('name').notNull(),
  requestType: text('request_type').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Template step. `conditionType`/`conditionValue` gate conditional approvers.
 *
 * A step names its approver in one of two ways:
 *   - `approverRole` — resolved per request from the org chart, so the route
 *     follows reorganisations automatically (MANAGER, DEPT_HEAD, HR, FINANCE,
 *     DIRECTOR, CTO, CEO).
 *   - `approverEmployeeId` — always this person, regardless of who filed the
 *     request. This is what makes a fixed chain such as
 *     Paul → Vicky → Aiden → CTO → CEO expressible.
 *
 * When both are set the named person wins; the role is retained as the label.
 */
export const approvalWorkflowSteps = pgTable(
  'approval_workflow_steps',
  {
    id: id(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    name: text('name').notNull(),
    approverRole: text('approver_role').notNull(),
    /** Fixed approver. Null means resolve `approverRole` per request. */
    approverEmployeeId: uuid('approver_employee_id').references(() => employees.id, { onDelete: 'set null' }),
    slaHours: integer('sla_hours').notNull().default(24),
    conditionType: text('condition_type').notNull().default('ALWAYS'), // ALWAYS | AMOUNT_GT | INTERNATIONAL | DAYS_GT
    conditionValue: numeric('condition_value', { precision: 14, scale: 2 }),
  },
  (t) => [uniqueIndex('workflow_step_order_uq').on(t.workflowId, t.stepOrder)],
);

/** Materialized step instance for one request. */
export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    name: text('name').notNull(),
    approverRole: text('approver_role').notNull(),
    approverId: uuid('approver_id').references(() => employees.id),
    status: text('status').notNull().default('PENDING'), // PENDING | IN_REVIEW | APPROVED | REJECTED | RETURNED | SKIPPED
    slaHours: integer('sla_hours').notNull().default(24),
    /**
     * True when the requester nominated this approver rather than the workflow
     * deriving it. Shown in the chain so an approver knows why they are on it,
     * and kept for audit — a requester adding reviewers is legitimate, but it
     * should be visible that they did.
     */
    addedByRequester: boolean('added_by_requester').notNull().default(false),
    dueAt: timestamp('due_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('approval_step_order_uq').on(t.requestId, t.stepOrder),
    index('approval_steps_approver_idx').on(t.approverId, t.status),
  ],
);

export const approvalActions = pgTable(
  'approval_actions',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').references(() => approvalSteps.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id')
      .notNull()
      .references(() => employees.id),
    action: text('action').notNull(), // SUBMIT | APPROVE | REJECT | RETURN | CANCEL | VIEW
    comment: text('comment'),
    actionAt: timestamp('action_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approval_actions_request_idx').on(t.requestId)],
);

/* ------------------------------------------------------------------ */
/* Detail: Leave                                                       */
/* ------------------------------------------------------------------ */

export const leaveRequests = pgTable('leave_requests', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: 'cascade' }),
  leaveType: text('leave_type').notNull(), // ANNUAL | SICK | UNPAID | SPECIAL | OTHER
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  halfDayStart: boolean('half_day_start').notNull().default(false),
  halfDayEnd: boolean('half_day_end').notNull().default(false),
  workingDays: numeric('working_days', { precision: 5, scale: 1 }).notNull(),
  calendarDays: integer('calendar_days').notNull(),
  reason: text('reason'),
  emergencyContact: text('emergency_contact'),
  handoverTo: uuid('handover_to').references(() => employees.id),
});

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: id(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    leaveType: text('leave_type').notNull(),
    allowance: numeric('allowance', { precision: 5, scale: 1 }).notNull().default('0'),
    used: numeric('used', { precision: 5, scale: 1 }).notNull().default('0'),
    pending: numeric('pending', { precision: 5, scale: 1 }).notNull().default('0'),
    carriedOver: numeric('carried_over', { precision: 5, scale: 1 }).notNull().default('0'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('leave_balance_uq').on(t.employeeId, t.year, t.leaveType)],
);

export const holidays = pgTable(
  'holidays',
  {
    id: id(),
    officeId: uuid('office_id').references(() => offices.id),
    holidayDate: date('holiday_date').notNull(),
    name: text('name').notNull(),
  },
  (t) => [index('holidays_date_idx').on(t.holidayDate)],
);

/* ------------------------------------------------------------------ */
/* Detail: Business trip                                               */
/* ------------------------------------------------------------------ */

export const businessTrips = pgTable('business_trips', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: 'cascade' }),
  country: text('country').notNull(),
  city: text('city').notNull(),
  isInternational: boolean('is_international').notNull().default(true),
  purpose: text('purpose').notNull(),
  eventName: text('event_name'),
  partner: text('partner'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  durationDays: integer('duration_days').notNull(),
  outboundFlight: text('outbound_flight'),
  inboundFlight: text('inbound_flight'),
  hotelName: text('hotel_name'),
  hotelNights: integer('hotel_nights').notNull().default(0),
  hotelRatePerNight: numeric('hotel_rate_per_night', { precision: 14, scale: 2 }),
  transportation: text('transportation'),
  currency: text('currency').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  totalOriginal: numeric('total_original', { precision: 14, scale: 2 }).notNull().default('0'),
  totalBase: numeric('total_base', { precision: 14, scale: 2 }).notNull().default('0'),
});

export const tripTravelers = pgTable(
  'trip_travelers',
  {
    id: id(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => businessTrips.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    isLead: boolean('is_lead').notNull().default(false),
  },
  (t) => [uniqueIndex('trip_traveler_uq').on(t.tripId, t.employeeId)],
);

/** Planned cost breakdown lines for a trip. */
export const tripCosts = pgTable('trip_costs', {
  id: id(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => businessTrips.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // FLIGHT | HOTEL | TRANSPORT | MEAL | EVENT_FEE | VISA | OTHER
  description: text('description'),
  currency: text('currency').notNull().default('USD'),
  amountOriginal: numeric('amount_original', { precision: 14, scale: 2 }).notNull().default('0'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull().default('0'),
});

/* ------------------------------------------------------------------ */
/* Detail: Procurement                                                 */
/* ------------------------------------------------------------------ */

export const vendors = pgTable('vendors', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
  country: text('country'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  rating: integer('rating'),
  isPreferred: boolean('is_preferred').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const purchaseRequests = pgTable('purchase_requests', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  category: text('category').notNull(), // IT | OFFICE | MARKETING | SOFTWARE | SERVICE | OTHER
  purpose: text('purpose').notNull(),
  requiredDate: date('required_date'),
  budgetId: uuid('budget_id'),
  quotationCount: integer('quotation_count').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  totalOriginal: numeric('total_original', { precision: 14, scale: 2 }).notNull().default('0'),
  totalBase: numeric('total_base', { precision: 14, scale: 2 }).notNull().default('0'),
});

export const purchaseItems = pgTable('purchase_items', {
  id: id(),
  purchaseRequestId: uuid('purchase_request_id')
    .notNull()
    .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  description: text('description'),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
});

/* ------------------------------------------------------------------ */
/* Detail: Expense                                                     */
/* ------------------------------------------------------------------ */

export const expenseClaims = pgTable('expense_claims', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: 'cascade' }),
  tripRequestId: uuid('trip_request_id').references(() => requests.id),
  paymentMethod: text('payment_method').notNull().default('PERSONAL'), // PERSONAL | CORPORATE_CARD | COMPANY_ACCOUNT
  currency: text('currency').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  totalOriginal: numeric('total_original', { precision: 14, scale: 2 }).notNull().default('0'),
  totalBase: numeric('total_base', { precision: 14, scale: 2 }).notNull().default('0'),
  reimbursedAt: timestamp('reimbursed_at', { withTimezone: true }),
});

export const expenseItems = pgTable(
  'expense_items',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => expenseClaims.id, { onDelete: 'cascade' }),
    expenseDate: date('expense_date').notNull(),
    category: text('category').notNull(), // TRAVEL | HOTEL | FLIGHT | MEAL | MARKETING | OFFICE | ENTERTAINMENT | SOFTWARE | OTHER
    merchant: text('merchant'),
    description: text('description'),
    currency: text('currency').notNull().default('USD'),
    amountOriginal: numeric('amount_original', { precision: 14, scale: 2 }).notNull().default('0'),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
    amountBase: numeric('amount_base', { precision: 14, scale: 2 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    /** sha256(merchant|date|amount) — powers duplicate-receipt detection. */
    receiptHash: text('receipt_hash'),
    attachmentId: uuid('attachment_id'),
    extractedByAi: boolean('extracted_by_ai').notNull().default(false),
  },
  (t) => [index('expense_items_hash_idx').on(t.receiptHash), index('expense_items_claim_idx').on(t.claimId)],
);

/* ------------------------------------------------------------------ */
/* Detail: HR / General                                                */
/* ------------------------------------------------------------------ */

export const genericRequests = pgTable('generic_requests', {
  id: id(),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  details: text('details'),
  requestedDate: date('requested_date'),
});

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    year: integer('year').notNull(),
    quarter: integer('quarter'), // null = annual
    departmentId: uuid('department_id').references(() => departments.id),
    costCenterId: uuid('cost_center_id').references(() => costCenters.id),
    category: text('category').notNull(), // TRAVEL | PROCUREMENT | OPERATING | MARKETING
    allocated: numeric('allocated', { precision: 14, scale: 2 }).notNull().default('0'),
    committed: numeric('committed', { precision: 14, scale: 2 }).notNull().default('0'),
    spent: numeric('spent', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('budget_uq').on(t.year, t.quarter, t.departmentId, t.category)],
);

/* ------------------------------------------------------------------ */
/* Cross-cutting                                                       */
/* ------------------------------------------------------------------ */

export const attachments = pgTable('attachments', {
  id: id(),
  requestId: uuid('request_id').references(() => requests.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  kind: text('kind').notNull().default('DOCUMENT'), // RECEIPT | QUOTATION | ITINERARY | DOCUMENT
  storagePath: text('storage_path').notNull(),
  contentHash: text('content_hash'),
  uploadedBy: uuid('uploaded_by').references(() => employees.id),
  createdAt: createdAt(),
});

export const comments = pgTable(
  'comments',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => employees.id),
    authorType: text('author_type').notNull().default('USER'), // USER | SYSTEM | AI
    body: text('body').notNull(),
    mentions: jsonb('mentions').$type<string[]>().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('comments_request_idx').on(t.requestId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    severity: text('severity').notNull().default('INFO'), // INFO | WARNING | CRITICAL
    isRead: boolean('is_read').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_employee_idx').on(t.employeeId, t.isRead)],
);

export const aiReviews = pgTable(
  'ai_reviews',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    /**
     * Language the prose was written in.
     *
     * The review caches finished sentences, so it is cached per language: a
     * Korean reader and an English reader each get their own row rather than one
     * of them being shown the other's language. The underlying findings are
     * identical — only the phrasing differs.
     */
    locale: text('locale').notNull().default('en'),
    provider: text('provider').notNull().default('mock'),
    summary: text('summary').notNull(),
    recommendation: text('recommendation').notNull(), // APPROVE | REVIEW | REJECT
    confidence: integer('confidence').notNull().default(0),
    riskLevel: text('risk_level').notNull().default('LOW'), // LOW | MEDIUM | HIGH
    reasoning: text('reasoning'),
    checks: jsonb('checks')
      .$type<{ label: string; status: 'PASS' | 'WARN' | 'FAIL'; detail?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    comparisons: jsonb('comparisons').$type<{ label: string; value: string }[]>().default(sql`'[]'::jsonb`),
    helpfulVotes: integer('helpful_votes').notNull().default(0),
    unhelpfulVotes: integer('unhelpful_votes').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('ai_reviews_request_locale_idx').on(t.requestId, t.locale)],
);

export const aiConversations = pgTable('ai_conversations', {
  id: id(),
  employeeId: uuid('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').references(() => requests.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull().default('GLOBAL'), // GLOBAL | REQUEST | MANAGEMENT
  title: text('title'),
  createdAt: createdAt(),
});

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant
    content: text('content').notNull(),
    payload: jsonb('payload'),
    createdAt: createdAt(),
  },
  (t) => [index('ai_messages_conversation_idx').on(t.conversationId)],
);

export const policies = pgTable('policies', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  appliesTo: text('applies_to').notNull(), // request type
  metric: text('metric').notNull(), // HOTEL_PER_NIGHT | MEAL_PER_DAY | PR_TOTAL | LEAVE_CONSECUTIVE | FLIGHT_CLASS
  operator: text('operator').notNull().default('LTE'), // LTE | GTE | EQ | REQUIRES
  threshold: numeric('threshold', { precision: 14, scale: 2 }),
  thresholdText: text('threshold_text'),
  currency: text('currency').notNull().default('USD'),
  severity: text('severity').notNull().default('WARNING'), // WARNING | BLOCKING
  message: text('message').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => employees.id),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_created_idx').on(t.createdAt), index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: id(),
    baseCurrency: text('base_currency').notNull().default('USD'),
    quoteCurrency: text('quote_currency').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    effectiveDate: date('effective_date').notNull(),
  },
  (t) => [uniqueIndex('exchange_rate_uq').on(t.baseCurrency, t.quoteCurrency, t.effectiveDate)],
);

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  office: one(offices, { fields: [employees.officeId], references: [offices.id] }),
  team: one(teams, { fields: [employees.teamId], references: [teams.id] }),
  manager: one(employees, { fields: [employees.managerId], references: [employees.id], relationName: 'manager' }),
  requests: many(requests),
}));

export const requestsRelations = relations(requests, ({ one, many }) => ({
  requester: one(employees, { fields: [requests.requesterId], references: [employees.id] }),
  department: one(departments, { fields: [requests.departmentId], references: [departments.id] }),
  costCenter: one(costCenters, { fields: [requests.costCenterId], references: [costCenters.id] }),
  steps: many(approvalSteps),
  actions: many(approvalActions),
  comments: many(comments),
  attachments: many(attachments),
  aiReviews: many(aiReviews),
  leave: one(leaveRequests, { fields: [requests.id], references: [leaveRequests.requestId] }),
  trip: one(businessTrips, { fields: [requests.id], references: [businessTrips.requestId] }),
  purchase: one(purchaseRequests, { fields: [requests.id], references: [purchaseRequests.requestId] }),
  expense: one(expenseClaims, { fields: [requests.id], references: [expenseClaims.requestId] }),
  generic: one(genericRequests, { fields: [requests.id], references: [genericRequests.requestId] }),
}));

export const approvalStepsRelations = relations(approvalSteps, ({ one }) => ({
  request: one(requests, { fields: [approvalSteps.requestId], references: [requests.id] }),
  approver: one(employees, { fields: [approvalSteps.approverId], references: [employees.id] }),
}));

export const businessTripsRelations = relations(businessTrips, ({ one, many }) => ({
  request: one(requests, { fields: [businessTrips.requestId], references: [requests.id] }),
  travelers: many(tripTravelers),
  costs: many(tripCosts),
}));

export const tripTravelersRelations = relations(tripTravelers, ({ one }) => ({
  trip: one(businessTrips, { fields: [tripTravelers.tripId], references: [businessTrips.id] }),
  employee: one(employees, { fields: [tripTravelers.employeeId], references: [employees.id] }),
}));

export const purchaseRequestsRelations = relations(purchaseRequests, ({ one, many }) => ({
  request: one(requests, { fields: [purchaseRequests.requestId], references: [requests.id] }),
  vendor: one(vendors, { fields: [purchaseRequests.vendorId], references: [vendors.id] }),
  items: many(purchaseItems),
}));

export const expenseClaimsRelations = relations(expenseClaims, ({ one, many }) => ({
  request: one(requests, { fields: [expenseClaims.requestId], references: [requests.id] }),
  items: many(expenseItems),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  request: one(requests, { fields: [comments.requestId], references: [requests.id] }),
  author: one(employees, { fields: [comments.authorId], references: [employees.id] }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  office: one(offices, { fields: [departments.officeId], references: [offices.id] }),
  employees: many(employees),
  teams: many(teams),
}));
