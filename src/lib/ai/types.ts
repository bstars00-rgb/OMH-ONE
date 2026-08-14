import type { RequestType, RiskLevel } from '@/types/domain';
import type { Locale } from '@/lib/i18n/types';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface AiCheck {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface AiComparison {
  label: string;
  value: string;
  /** Signed percentage against the benchmark, when one exists. */
  deltaPct?: number;
}

export interface RequestSummary {
  summary: string;
  headline: string;
  /** True when a configured model was unreachable and the rules engine answered instead. */
  degraded?: boolean;
}

export interface PolicyReview {
  checks: AiCheck[];
  violations: number;
  blocking: boolean;
}

export interface RiskAssessment {
  riskLevel: RiskLevel;
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  confidence: number;
  reasoning: string;
  comparisons: AiComparison[];
  degraded?: boolean;
}

export interface FullReview extends RequestSummary, PolicyReview, RiskAssessment {
  provider: string;
  degraded: boolean;
}

export interface ExpenseDraftLine {
  merchant: string;
  expenseDate: string;
  currency: string;
  amount: number;
  taxAmount: number;
  category: string;
  confidence: number;
}

export interface FormDraft {
  /** Field values keyed by form field name, ready to populate the create form. */
  fields: Record<string, unknown>;
  /** What the model could not determine and the user must supply. */
  missing: string[];
  notes: string[];
  confidence: number;
}

export interface ManagementAnswer {
  summary: string;
  evidence: string[];
  risk: string | null;
  action: string | null;
  /** The structured query actually executed, shown in the UI for transparency. */
  intent: string;
  degraded?: boolean;
}

export interface CopilotAnswer {
  answer: string;
  evidence: string[];
  degraded?: boolean;
}

export interface ProactiveInsight {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  detail: string;
  href?: string;
}

export interface MorningBrief {
  greeting: string;
  pendingCount: number;
  lines: ProactiveInsight[];
  degraded: boolean;
}

/** Everything a provider is allowed to see. Assembled post-authorization. */
export interface RequestContext {
  requestId: string;
  requestNumber: string;
  requestType: RequestType;
  title: string;
  description: string | null;
  status: string;
  amountBase: number;
  currency: string;
  requesterName: string;
  requesterId: string;
  departmentCode: string | null;
  submittedAt: Date | null;

  leave?: {
    leaveType: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    calendarDays: number;
    balanceRemaining: number;
    balanceAfter: number;
    allowance: number;
    collisions: { name: string; startDate: string; endDate: string }[];
    holidaysInRange: string[];
  };

  trip?: {
    city: string;
    country: string;
    isInternational: boolean;
    durationDays: number;
    travellerCount: number;
    travellerNames: string[];
    hotelNights: number;
    hotelRatePerNight: number;
    costs: { category: string; amount: number }[];
    historicalAvgPerTraveller: number | null;
    historicalTripCount: number;
    concurrentTravellers: { name: string; city: string; startDate: string }[];
  };

  purchase?: {
    category: string;
    vendorName: string | null;
    quotationCount: number;
    items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
    priorPurchases: { requestNumber: string; date: string; unitPrice: number; vendorName: string | null }[];
    priorAvgUnitPrice: number | null;
  };

  expense?: {
    paymentMethod: string;
    items: { category: string; merchant: string | null; amount: number; date: string }[];
    mealTotalPerDay: number;
    duplicates: { requestNumber: string; merchant: string; date: string; amount: number }[];
    linkedTripNumber: string | null;
  };

  budget: {
    category: string;
    allocated: number;
    committed: number;
    spent: number;
    remaining: number;
    utilization: number;
  } | null;

  policies: {
    code: string;
    name: string;
    metric: string;
    operator: string;
    threshold: number | null;
    thresholdText: string | null;
    severity: string;
    message: string;
  }[];

  requesterHistory: {
    totalRequests: number;
    approvedRequests: number;
    avgAmount: number;
  };

  attachmentCount: number;
  approvalChain: { name: string; approverName: string | null; status: string }[];
}

/**
 * Everything a provider needs to write in the reader's language.
 *
 * Passed per call rather than fixed at construction because the provider is
 * cached for the process while the locale changes per request.
 */
export interface AiLocaleContext {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** For values that come from the database — falls back to the stored text. */
  tOr: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
  money: (amount: number | string | null | undefined, currency?: string) => string;
  date: (value: Date | string | null | undefined) => string;
  range: (start: string, end: string) => string;
}

export interface AIProvider {
  readonly name: string;
  summarizeRequest(ctx: RequestContext, l: AiLocaleContext): Promise<RequestSummary>;
  reviewPolicy(ctx: RequestContext, l: AiLocaleContext): Promise<PolicyReview>;
  detectRisk(ctx: RequestContext, policy: PolicyReview, l: AiLocaleContext): Promise<RiskAssessment>;
  answerRequestQuestion(question: string, ctx: RequestContext, l: AiLocaleContext): Promise<CopilotAnswer>;
  generateForm(prompt: string, type: RequestType, ctx: FormGenerationContext): Promise<FormDraft>;
  extractExpense(input: { fileName: string; hintText?: string }): Promise<ExpenseDraftLine>;
}

export interface FormGenerationContext {
  today: string;
  employeeNames: { id: string; name: string }[];
  destinations: { city: string; country: string }[];
  vendors: { id: string; name: string; category: string | null }[];
  requesterName: string;
}
