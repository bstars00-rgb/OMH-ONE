/** Shared domain unions + display metadata. Single source of truth for status/type labels. */

export const REQUEST_TYPES = ['LEAVE', 'BUSINESS_TRIP', 'PURCHASE', 'EXPENSE', 'HR', 'GENERAL'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DIRECTOR',
  'HR',
  'FINANCE',
  'MANAGER',
  'EMPLOYEE',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles a workflow step can route to, resolved per request from the org chart.
 * A step may instead name a specific person (`approverEmployeeId`), which is how
 * a fixed chain like Paul → Vicky → Aiden → CTO → CEO is expressed.
 */
export const APPROVER_ROLES = ['MANAGER', 'DEPT_HEAD', 'HR', 'FINANCE', 'DIRECTOR', 'CTO', 'CEO'] as const;
export type ApproverRole = (typeof APPROVER_ROLES)[number];

/**
 * Executive roles have no department of their own to derive a head from, so the
 * person holding each is designated in `system_settings` under these keys and
 * edited in Admin → Settings. Changing the holder re-routes future requests
 * without touching any workflow.
 */
export const EXECUTIVE_SETTING_KEYS: Partial<Record<ApproverRole, string>> = {
  CEO: 'approver.CEO',
  CTO: 'approver.CTO',
  DIRECTOR: 'approver.DIRECTOR',
};

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'SPECIAL', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  'TRAVEL',
  'HOTEL',
  'FLIGHT',
  'MEAL',
  'MARKETING',
  'OFFICE',
  'ENTERTAINMENT',
  'SOFTWARE',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const TRIP_COST_CATEGORIES = [
  'FLIGHT',
  'HOTEL',
  'TRANSPORT',
  'MEAL',
  'EVENT_FEE',
  'VISA',
  'OTHER',
] as const;
export type TripCostCategory = (typeof TRIP_COST_CATEGORIES)[number];

export const PURCHASE_CATEGORIES = ['IT', 'OFFICE', 'MARKETING', 'SOFTWARE', 'SERVICE', 'OTHER'] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

export const CURRENCIES = ['USD', 'KRW', 'VND', 'JPY', 'SGD', 'EUR', 'THB'] as const;
export type Currency = (typeof CURRENCIES)[number];

/* ---------------------------------------------------------------- */
/* Display metadata — status is never communicated by colour alone.  */
/* Every badge carries icon + label + tooltip.                       */
/* ---------------------------------------------------------------- */

export const REQUEST_TYPE_META: Record<RequestType, { label: string; short: string; prefix: string; icon: string }> = {
  LEAVE: { label: 'Annual Leave', short: 'Leave', prefix: 'LV', icon: 'CalendarDays' },
  BUSINESS_TRIP: { label: 'Business Trip', short: 'Trip', prefix: 'BT', icon: 'Plane' },
  PURCHASE: { label: 'Purchase Request', short: 'PR', prefix: 'PR', icon: 'ShoppingCart' },
  EXPENSE: { label: 'Expense Claim', short: 'Expense', prefix: 'EX', icon: 'Receipt' },
  HR: { label: 'HR Request', short: 'HR', prefix: 'HR', icon: 'UserCog' },
  GENERAL: { label: 'General Approval', short: 'General', prefix: 'GA', icon: 'FileText' },
};

export const STATUS_META: Record<
  RequestStatus,
  { label: string; icon: string; tone: string; tooltip: string }
> = {
  DRAFT: {
    label: 'Draft',
    icon: 'PencilLine',
    tone: 'slate',
    tooltip: 'Not submitted yet. Only you can see this.',
  },
  SUBMITTED: {
    label: 'Submitted',
    icon: 'Send',
    tone: 'blue',
    tooltip: 'Sent for approval, waiting for the first approver to open it.',
  },
  IN_REVIEW: {
    label: 'In review',
    icon: 'Clock',
    tone: 'amber',
    tooltip: 'An approver has opened this and is reviewing it.',
  },
  APPROVED: { label: 'Approved', icon: 'CheckCircle2', tone: 'emerald', tooltip: 'All approval steps completed.' },
  REJECTED: { label: 'Rejected', icon: 'XCircle', tone: 'rose', tooltip: 'Declined by an approver. Closed.' },
  RETURNED: {
    label: 'Returned',
    icon: 'Undo2',
    tone: 'orange',
    tooltip: 'Sent back to the requester for correction, then resubmit.',
  },
  CANCELED: { label: 'Canceled', icon: 'Ban', tone: 'slate', tooltip: 'Withdrawn by the requester.' },
};

export const PRIORITY_META: Record<Priority, { label: string; icon: string; tone: string; tooltip: string }> = {
  CRITICAL: { label: 'Critical', icon: 'AlertOctagon', tone: 'rose', tooltip: 'Overdue or high financial impact.' },
  HIGH: { label: 'High', icon: 'AlertTriangle', tone: 'orange', tooltip: 'Approaching SLA or above-average amount.' },
  NORMAL: { label: 'Normal', icon: 'Minus', tone: 'slate', tooltip: 'Standard turnaround.' },
  LOW: { label: 'Low', icon: 'ArrowDown', tone: 'slate', tooltip: 'Small amount, no policy flags.' },
};

export const RISK_META: Record<RiskLevel, { label: string; icon: string; tone: string; tooltip: string }> = {
  LOW: { label: 'Low risk', icon: 'ShieldCheck', tone: 'emerald', tooltip: 'No policy or budget concerns detected.' },
  MEDIUM: {
    label: 'Medium risk',
    icon: 'ShieldAlert',
    tone: 'amber',
    tooltip: 'One or more soft policy warnings. Review before approving.',
  },
  HIGH: {
    label: 'High risk',
    icon: 'ShieldX',
    tone: 'rose',
    tooltip: 'Budget breach or blocking policy violation. Read the detail before deciding.',
  },
};

export const DEPARTMENT_ORDER = ['SCM', 'GSM', 'OP', 'CT', 'IT', 'FIN', 'HR', 'CEO'] as const;

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', description: 'Full configuration and data access.' },
  ADMIN: { label: 'Admin', description: 'Workflow, policy, org and user configuration.' },
  DIRECTOR: { label: 'Director', description: 'Company-wide approval and analytics.' },
  HR: { label: 'HR', description: 'Employee records, leave data, HR requests.' },
  FINANCE: { label: 'Finance', description: 'Expense, procurement and budget.' },
  MANAGER: { label: 'Manager', description: 'Own department requests and approvals.' },
  EMPLOYEE: { label: 'Employee', description: 'Own requests only.' },
  AUDITOR: { label: 'Auditor', description: 'Read-only access across the company.' },
};

/** Terminal states cannot transition further. */
export const TERMINAL_STATUSES: RequestStatus[] = ['APPROVED', 'REJECTED', 'CANCELED'];
export const OPEN_STATUSES: RequestStatus[] = ['SUBMITTED', 'IN_REVIEW'];
