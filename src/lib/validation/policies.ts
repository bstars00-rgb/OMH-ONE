import { z } from 'zod';

/**
 * What a policy can actually be.
 *
 * A policy row is only a rule if something evaluates it. `evaluatePolicy`
 * switches on `metric`, and each branch reads a specific slice of the request
 * context — HOTEL_PER_NIGHT reads `ctx.trip`, MEAL_PER_DAY reads `ctx.expense`.
 * A metric with no branch, or a metric paired with a request type that never
 * carries its facts, produces a row that is stored, listed, and silently does
 * nothing on every request forever.
 *
 * So the metric list below is exactly the set of branches that exist, and
 * `appliesTo` is constrained to the request types that carry each metric's
 * facts. New rule *kinds* need a new branch in the evaluator, not a new row —
 * the UI says so rather than offering a free-text field that cannot work.
 */
export const POLICY_METRICS = {
  HOTEL_PER_NIGHT: { types: ['BUSINESS_TRIP'], threshold: 'money' },
  MEAL_PER_DAY: { types: ['EXPENSE'], threshold: 'money' },
  FLIGHT_CLASS: { types: ['BUSINESS_TRIP'], threshold: 'none' },
  PR_TOTAL: { types: ['PURCHASE'], threshold: 'money' },
  LEAVE_CONSECUTIVE: { types: ['LEAVE'], threshold: 'days' },
  BUDGET_REMAINING: { types: ['BUSINESS_TRIP', 'PURCHASE', 'EXPENSE', 'GENERAL'], threshold: 'none' },
} as const satisfies Record<string, { types: readonly string[]; threshold: 'money' | 'days' | 'none' }>;

export const POLICY_METRIC_KEYS = Object.keys(POLICY_METRICS) as (keyof typeof POLICY_METRICS)[];
export type PolicyMetric = keyof typeof POLICY_METRICS;

export function metricTakesThreshold(metric: string): boolean {
  return POLICY_METRICS[metric as PolicyMetric]?.threshold !== 'none';
}

export function typesForMetric(metric: string): readonly string[] {
  return POLICY_METRICS[metric as PolicyMetric]?.types ?? [];
}

export const newPolicySchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, 'pol.badCode')
      .max(30, 'pol.badCode')
      .regex(/^[A-Z][A-Z0-9-]*$/, 'pol.badCode'),
    name: z.string().trim().min(2, 'pol.needName').max(80),
    metric: z.enum(POLICY_METRIC_KEYS as [PolicyMetric, ...PolicyMetric[]]),
    appliesTo: z.string().trim().min(2),
    threshold: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
    severity: z.enum(['WARNING', 'BLOCKING']),
    message: z.string().trim().min(10, 'pol.needMessage').max(400),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (!typesForMetric(v.metric).includes(v.appliesTo)) {
      ctx.addIssue({ code: 'custom', path: ['appliesTo'], message: 'pol.metricTypeMismatch' });
    }
    if (metricTakesThreshold(v.metric) && (v.threshold == null || Number.isNaN(v.threshold))) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'pol.needThreshold' });
    }
  });

export type NewPolicyInput = z.infer<typeof newPolicySchema>;
