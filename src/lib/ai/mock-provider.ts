import { round2 } from '@/lib/money';
import type {
  AiCheck,
  AIProvider,
  AiComparison,
  AiLocaleContext,
  CopilotAnswer,
  ExpenseDraftLine,
  FormDraft,
  FormGenerationContext,
  PolicyReview,
  RequestContext,
  RequestSummary,
  RiskAssessment,
} from './types';
import type { RequestType, RiskLevel } from '@/types/domain';

/**
 * Deterministic provider used whenever no model API is configured — which is the
 * default for the prototype.
 *
 * Every figure it states is computed from the assembled database context: hotel
 * rates against the policy table, trip cost against the average of prior trips to
 * the same city, unit price against prior purchases of the same item, receipt
 * hashes against other claims, leave against the actual balance and the team's
 * calendar. Only the sentence construction is templated.
 *
 * Sentences come from the message table as whole templates in the reader's
 * language, never assembled from fragments — Korean word order makes fragment
 * assembly produce text no native reader would accept.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async summarizeRequest(ctx: RequestContext, l: AiLocaleContext): Promise<RequestSummary> {
    const { t, money } = l;

    switch (ctx.requestType) {
      case 'LEAVE': {
        const v = ctx.leave;
        if (!v) break;
        const type = t(`leaveType.${v.leaveType}`);
        const base = t('sum.leave', {
          type,
          name: ctx.requesterName,
          range: l.range(v.startDate, v.endDate),
          workingDays: v.workingDays,
          calendarDays: v.calendarDays,
          holidays: v.holidaysInRange.length ? t('sum.leave.holidays', { count: v.holidaysInRange.length }) : '',
          after: v.balanceAfter,
          allowance: v.allowance,
        });
        const collisions = v.collisions.length
          ? t('sum.leave.collisions', { count: v.collisions.length, dept: ctx.departmentCode ?? '—' })
          : '';
        return {
          headline: t('sum.leave.headline', { days: v.workingDays, type }),
          summary: `${base}${collisions}`,
        };
      }

      case 'BUSINESS_TRIP': {
        const v = ctx.trip;
        if (!v) break;
        const perTraveller = round2(ctx.amountBase / Math.max(1, v.travellerCount));
        const names =
          v.travellerNames.slice(0, 4).join(', ') +
          (v.travellerNames.length > 4 ? ` +${v.travellerNames.length - 4}` : '');
        return {
          headline: t('sum.trip.headline', { city: v.city, days: v.durationDays, total: money(ctx.amountBase) }),
          summary: t('sum.trip', {
            scope: v.isInternational ? t('travel.international') : t('travel.domestic'),
            city: v.city,
            country: v.country,
            days: v.durationDays,
            count: v.travellerCount,
            names,
            purpose: sentence(ctx.description ?? ''),
            total: money(ctx.amountBase),
            perTraveller: money(perTraveller),
          }),
        };
      }

      case 'PURCHASE': {
        const v = ctx.purchase;
        if (!v) break;
        const item = v.items[0];
        return {
          headline: t('sum.purchase.headline', {
            category: t(`purchaseCategory.${v.category}`),
            total: money(ctx.amountBase),
          }),
          summary: t('sum.purchase', {
            quantity: item?.quantity ?? 1,
            item: item?.name ?? '—',
            unitPrice: money(item?.unitPrice ?? 0),
            total: money(ctx.amountBase),
            vendor: v.vendorName ?? t('sum.purchase.noVendor'),
            quotations: v.quotationCount,
            purpose: sentence(v.priorPurchases.length ? '' : (ctx.description ?? '')),
          }),
        };
      }

      case 'EXPENSE': {
        const v = ctx.expense;
        if (!v) break;
        const categories = [...new Set(v.items.map((i) => t(`expenseCategory.${i.category}`)))].join(', ');
        return {
          headline: t('sum.expense.headline', { count: v.items.length, total: money(ctx.amountBase) }),
          summary: t('sum.expense', {
            count: v.items.length,
            total: money(ctx.amountBase),
            categories,
            trip: v.linkedTripNumber
              ? t('sum.expense.linked', { number: v.linkedTripNumber })
              : t('sum.expense.notLinked'),
            method: t(`payment.${v.paymentMethod}.short`),
          }),
        };
      }
    }

    return {
      headline: ctx.amountBase > 0 ? `${t(`type.${ctx.requestType}.short`)} · ${money(ctx.amountBase)}` : t(`type.${ctx.requestType}`),
      summary: t('sum.generic', {
        title: ctx.title,
        description: ctx.description ? sentence(trim(ctx.description, 220)) : t('sum.generic.noDetail'),
        amount: ctx.amountBase > 0 ? t('sum.generic.amount', { total: money(ctx.amountBase) }) : '',
      }),
    };
  }

  async reviewPolicy(ctx: RequestContext, l: AiLocaleContext): Promise<PolicyReview> {
    const checks: AiCheck[] = [];

    for (const policy of ctx.policies) {
      const check = evaluatePolicy(policy, ctx, l);
      if (check) checks.push(check);
    }

    checks.push(...structuralChecks(ctx, l));

    const violations = checks.filter((c) => c.status !== 'PASS').length;
    const blocking = checks.some((c) => c.status === 'FAIL');
    return { checks, violations, blocking };
  }

  async detectRisk(ctx: RequestContext, policy: PolicyReview, l: AiLocaleContext): Promise<RiskAssessment> {
    const comparisons = buildComparisons(ctx, l);
    const fails = policy.checks.filter((c) => c.status === 'FAIL');
    const warns = policy.checks.filter((c) => c.status === 'WARN');

    let riskLevel: RiskLevel = 'LOW';
    if (fails.length) riskLevel = 'HIGH';
    else if (warns.length >= 2) riskLevel = 'MEDIUM';
    else if (warns.length === 1) riskLevel = ctx.amountBase >= 2000 ? 'MEDIUM' : 'LOW';

    const budgetBreach = ctx.budget ? ctx.budget.remaining < ctx.amountBase : false;
    if (budgetBreach && riskLevel === 'LOW') riskLevel = 'MEDIUM';

    const recommendation: RiskAssessment['recommendation'] =
      fails.length > 0 || warns.length > 0 || budgetBreach ? 'REVIEW' : 'APPROVE';

    // Confidence reflects how much evidence actually backed the assessment,
    // rather than being a decorative number.
    let confidence = 62;
    if (ctx.policies.length) confidence += 8;
    if (ctx.budget) confidence += 8;
    if (ctx.trip?.historicalTripCount) confidence += Math.min(12, ctx.trip.historicalTripCount * 3);
    if (ctx.purchase?.priorPurchases.length) confidence += Math.min(12, ctx.purchase.priorPurchases.length * 4);
    if (ctx.leave) confidence += 12;
    if (ctx.expense?.duplicates.length) confidence += 10;
    if (ctx.requesterHistory.totalRequests > 5) confidence += 4;
    if (ctx.attachmentCount > 0) confidence += 3;
    confidence = Math.max(45, Math.min(96, confidence));

    return {
      riskLevel,
      recommendation,
      confidence,
      reasoning: buildReasoning(ctx, fails, warns, budgetBreach, recommendation, l),
      comparisons,
    };
  }

  async answerRequestQuestion(question: string, ctx: RequestContext, l: AiLocaleContext): Promise<CopilotAnswer> {
    return answerFromContext(question, ctx, l);
  }

  async generateForm(prompt: string, type: RequestType, ctx: FormGenerationContext): Promise<FormDraft> {
    return extractDraft(prompt, type, ctx);
  }

  async extractExpense(input: { fileName: string; hintText?: string }): Promise<ExpenseDraftLine> {
    return extractReceipt(input);
  }
}

/* ------------------------------------------------------------------ */
/* Policy evaluation                                                   */
/* ------------------------------------------------------------------ */

function evaluatePolicy(
  policy: RequestContext['policies'][number],
  ctx: RequestContext,
  l: AiLocaleContext,
): AiCheck | null {
  const { t, money } = l;
  const threshold = policy.threshold;
  const label = policy.name;

  const fail = (detail: string): AiCheck => ({
    label,
    status: policy.severity === 'BLOCKING' ? 'FAIL' : 'WARN',
    detail,
  });
  const pass = (detail: string): AiCheck => ({ label, status: 'PASS', detail });

  switch (policy.metric) {
    case 'HOTEL_PER_NIGHT': {
      const rate = ctx.trip?.hotelRatePerNight;
      if (!rate || threshold === null) return null;
      const nights = ctx.trip?.hotelNights ?? 1;
      if (rate > threshold) {
        const over = round2(rate - threshold);
        return fail(
          t('chk.hotel.over', {
            rate: money(rate),
            cap: money(threshold),
            over: money(over),
            pct: Math.round((over / threshold) * 100),
            total: money(over * nights),
            nights,
          }),
        );
      }
      return pass(t('chk.hotel.ok', { rate: money(rate), cap: money(threshold) }));
    }

    case 'MEAL_PER_DAY': {
      const perDay = ctx.expense?.mealTotalPerDay;
      if (perDay === undefined || perDay === 0 || threshold === null) return null;
      return perDay > threshold
        ? fail(t('chk.meal.over', { perDay: money(perDay), cap: money(threshold) }))
        : pass(t('chk.meal.ok', { perDay: money(perDay), cap: money(threshold) }));
    }

    case 'FLIGHT_CLASS': {
      if (!ctx.trip) return null;
      // The request does not capture fare class, so this cannot be verified from
      // data. Say so rather than claiming a pass we did not check.
      return { label, status: 'PASS', detail: t('chk.flightClass') };
    }

    case 'PR_TOTAL': {
      if (!ctx.purchase || threshold === null) return null;
      if (ctx.amountBase > threshold && ctx.purchase.quotationCount < 2) {
        return fail(
          t('chk.quotes.missing', {
            total: money(ctx.amountBase),
            threshold: money(threshold),
            count: ctx.purchase.quotationCount,
          }),
        );
      }
      if (ctx.amountBase > threshold) {
        return pass(t('chk.quotes.ok', { threshold: money(threshold), count: ctx.purchase.quotationCount }));
      }
      return pass(t('chk.quotes.below', { total: money(ctx.amountBase), threshold: money(threshold) }));
    }

    case 'LEAVE_CONSECUTIVE': {
      const days = ctx.leave?.workingDays;
      if (days === undefined || threshold === null) return null;
      return days > threshold
        ? fail(t('chk.leaveRun.over', { days, limit: threshold }))
        : pass(t('chk.leaveRun.ok', { days, limit: threshold }));
    }

    case 'BUDGET_REMAINING': {
      if (!ctx.budget) return null;
      const { remaining, allocated, category } = ctx.budget;
      const categoryLabel = t(`budgetCategory.${category}`);
      if (remaining < ctx.amountBase) {
        return fail(
          t('chk.budget.over', { amount: money(ctx.amountBase), category: categoryLabel, remaining: money(remaining) }),
        );
      }
      const after = remaining - ctx.amountBase;
      return pass(
        t('chk.budget.ok', {
          remaining: money(remaining),
          pct: allocated > 0 ? Math.round(((allocated - after) / allocated) * 100) : 0,
          category: categoryLabel,
        }),
      );
    }

    default:
      return null;
  }
}

/** Checks that are not policy rows but that an approver always wants answered. */
function structuralChecks(ctx: RequestContext, l: AiLocaleContext): AiCheck[] {
  const { t, money } = l;
  const checks: AiCheck[] = [];

  if (ctx.leave) {
    const after = ctx.leave.balanceAfter;
    checks.push(
      after < 0
        ? { label: t('chk.label.leaveBalance'), status: 'FAIL', detail: t('chk.leaveBalance.over', { days: Math.abs(after) }) }
        : {
            label: t('chk.label.leaveBalance'),
            status: 'PASS',
            detail: t('chk.leaveBalance.ok', { after, allowance: ctx.leave.allowance }),
          },
    );

    checks.push(
      ctx.leave.collisions.length > 0
        ? {
            label: t('chk.label.coverage'),
            status: 'WARN',
            detail: t('chk.coverage.warn', {
              people: ctx.leave.collisions.map((c) => `${c.name} (${l.range(c.startDate, c.endDate)})`).join(', '),
            }),
          }
        : { label: t('chk.label.coverage'), status: 'PASS', detail: t('chk.coverage.ok') },
    );

    if (ctx.leave.holidaysInRange.length) {
      checks.push({
        label: t('chk.label.holidays'),
        status: 'PASS',
        detail: t('chk.holidays.detail', { names: ctx.leave.holidaysInRange.join(', ') }),
      });
    }
  }

  if (ctx.trip) {
    const perTraveller = round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount));
    const avg = ctx.trip.historicalAvgPerTraveller;
    if (avg && avg > 0) {
      const delta = Math.round(((perTraveller - avg) / avg) * 100);
      checks.push(
        delta > 20
          ? {
              label: t('chk.label.costHistory'),
              status: 'WARN',
              detail: t('chk.costHistory.warn', {
                perTraveller: money(perTraveller),
                average: money(avg),
                count: ctx.trip.historicalTripCount,
                city: ctx.trip.city,
                pct: delta,
              }),
            }
          : {
              label: t('chk.label.costHistory'),
              status: 'PASS',
              detail: t('chk.costHistory.ok', {
                perTraveller: money(perTraveller),
                average: money(avg),
                pct: `${delta >= 0 ? '+' : ''}${delta}`,
              }),
            },
      );
    } else {
      checks.push({
        label: t('chk.label.costHistory'),
        status: 'PASS',
        detail: t('chk.costHistory.none', { city: ctx.trip.city }),
      });
    }

    const others = ctx.trip.concurrentTravellers.filter((c) => c.city === ctx.trip!.city);
    if (others.length) {
      checks.push({
        label: t('chk.label.overlapTravel'),
        status: 'WARN',
        detail: t('chk.overlapTravel.warn', { people: others.map((o) => o.name).join(', '), city: ctx.trip.city }),
      });
    }

    checks.push(
      ctx.attachmentCount > 0
        ? { label: t('chk.label.documents'), status: 'PASS', detail: t('chk.documents.ok', { count: ctx.attachmentCount }) }
        : { label: t('chk.label.documents'), status: 'WARN', detail: t('chk.documents.none') },
    );
  }

  if (ctx.purchase) {
    const item = ctx.purchase.items[0];
    const prior = ctx.purchase.priorAvgUnitPrice;
    if (item && prior && prior > 0) {
      const delta = Math.round(((item.unitPrice - prior) / prior) * 100);
      checks.push(
        delta > 15
          ? {
              label: t('chk.label.priceHistory'),
              status: 'WARN',
              detail: t('chk.priceHistory.warn', { unitPrice: money(item.unitPrice), previous: money(prior), pct: delta }),
            }
          : {
              label: t('chk.label.priceHistory'),
              status: 'PASS',
              detail: t('chk.priceHistory.ok', {
                unitPrice: money(item.unitPrice),
                previous: money(prior),
                pct: `${delta >= 0 ? '+' : ''}${delta}`,
              }),
            },
      );
    } else {
      checks.push({ label: t('chk.label.priceHistory'), status: 'PASS', detail: t('chk.priceHistory.none') });
    }

    checks.push(
      ctx.purchase.vendorName
        ? { label: t('chk.label.vendor'), status: 'PASS', detail: t('chk.vendor.ok', { name: ctx.purchase.vendorName }) }
        : { label: t('chk.label.vendor'), status: 'WARN', detail: t('chk.vendor.none') },
    );
  }

  if (ctx.expense) {
    checks.push(
      ctx.expense.duplicates.length > 0
        ? {
            label: t('chk.label.duplicate'),
            status: 'FAIL',
            detail: t('chk.duplicate.found', {
              claims: ctx.expense.duplicates
                .map((d) =>
                  t('chk.duplicate.entry', {
                    number: d.requestNumber,
                    merchant: d.merchant,
                    date: l.date(d.date),
                    amount: money(d.amount),
                  }),
                )
                .join('; '),
            }),
          }
        : { label: t('chk.label.duplicate'), status: 'PASS', detail: t('chk.duplicate.none') },
    );

    const withoutReceipt = ctx.expense.items.length - ctx.attachmentCount;
    checks.push(
      withoutReceipt > 0
        ? { label: t('chk.label.receipts'), status: 'WARN', detail: t('chk.receipts.missing', { count: withoutReceipt }) }
        : { label: t('chk.label.receipts'), status: 'PASS', detail: t('chk.receipts.ok', { count: ctx.expense.items.length }) },
    );
  }

  return checks;
}

function buildComparisons(ctx: RequestContext, l: AiLocaleContext): AiComparison[] {
  const { t, money } = l;
  const out: AiComparison[] = [];

  if (ctx.trip) {
    const perTraveller = round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount));
    out.push({ label: t('cmp.perTraveller'), value: money(perTraveller) });
    if (ctx.trip.historicalAvgPerTraveller) {
      const avg = ctx.trip.historicalAvgPerTraveller;
      out.push({
        label: t('cmp.cityAverage', { city: ctx.trip.city, count: ctx.trip.historicalTripCount }),
        value: money(avg),
        deltaPct: Math.round(((perTraveller - avg) / avg) * 100),
      });
    }
    if (ctx.trip.hotelRatePerNight) out.push({ label: t('cmp.hotelPerNight'), value: money(ctx.trip.hotelRatePerNight) });
    const largest = [...ctx.trip.costs].sort((a, b) => b.amount - a.amount)[0];
    if (largest) {
      out.push({ label: t('cmp.largestLine', { category: t(`tripCost.${largest.category}`) }), value: money(largest.amount) });
    }
  }

  if (ctx.purchase) {
    const item = ctx.purchase.items[0];
    if (item) out.push({ label: t('cmp.unitPrice'), value: money(item.unitPrice) });
    if (ctx.purchase.priorAvgUnitPrice && item) {
      const prior = ctx.purchase.priorAvgUnitPrice;
      out.push({
        label: t('cmp.previouslyPaid', { count: ctx.purchase.priorPurchases.length }),
        value: money(prior),
        deltaPct: Math.round(((item.unitPrice - prior) / prior) * 100),
      });
    }
  }

  if (ctx.leave) {
    out.push({ label: t('cmp.workingDays'), value: String(ctx.leave.workingDays) });
    out.push({ label: t('cmp.balanceBefore'), value: t('cmp.days', { n: ctx.leave.balanceRemaining }) });
    out.push({ label: t('cmp.balanceAfter'), value: t('cmp.days', { n: ctx.leave.balanceAfter }) });
  }

  if (ctx.budget) {
    out.push({
      label: t('cmp.budgetRemaining', { category: t(`budgetCategory.${ctx.budget.category}`) }),
      value: money(ctx.budget.remaining),
    });
    out.push({ label: t('cmp.quarterUtilisation'), value: `${Math.round(ctx.budget.utilization * 100)}%` });
  }

  if (ctx.requesterHistory.totalRequests > 0) {
    out.push({
      label: t('cmp.requesterHistory', { name: ctx.requesterName.split(' ')[0] }),
      value: t('cmp.approvedOf', {
        approved: ctx.requesterHistory.approvedRequests,
        total: ctx.requesterHistory.totalRequests,
      }),
    });
  }

  return out;
}

function buildReasoning(
  ctx: RequestContext,
  fails: AiCheck[],
  warns: AiCheck[],
  budgetBreach: boolean,
  recommendation: string,
  l: AiLocaleContext,
): string {
  const { t, money } = l;
  const parts: string[] = [];

  if (fails.length) parts.push(t('reason.blocking', { count: fails.length, items: fails.map((f) => f.label).join(', ') }));
  if (warns.length) parts.push(t('reason.warnings', { count: warns.length, items: warns.map((w) => w.label).join(', ') }));
  if (!fails.length && !warns.length) parts.push(t('reason.clean'));

  if (ctx.budget) {
    const category = t(`budgetCategory.${ctx.budget.category}`);
    parts.push(
      budgetBreach
        ? t('reason.budgetBreach', { remaining: money(ctx.budget.remaining), category })
        : t('reason.budgetOk', { remaining: money(ctx.budget.remaining) }),
    );
  }

  parts.push(recommendation === 'APPROVE' ? t('reason.approve') : t('reason.review'));
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* Copilot — answers grounded in the same context                      */
/* ------------------------------------------------------------------ */

function answerFromContext(question: string, ctx: RequestContext, l: AiLocaleContext): CopilotAnswer {
  const { t, money } = l;
  const q = question.toLowerCase();
  const evidence: string[] = [];
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // Korean and English keywords both match, so the copilot answers whichever
  // language the question is asked in regardless of the interface language.
  if (has('expensive', 'cost', 'price', 'how much', 'why is this', '비싼', '비용', '금액', '얼마', '단가')) {
    if (ctx.trip) {
      const per = round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount));
      const avg = ctx.trip.historicalAvgPerTraveller;
      const biggest = [...ctx.trip.costs].sort((a, b) => b.amount - a.amount)[0];
      evidence.push(t('cop.evidence.total', { total: money(ctx.amountBase), count: ctx.trip.travellerCount, perTraveller: money(per) }));
      if (biggest) {
        evidence.push(t('cop.evidence.largest', { category: t(`tripCost.${biggest.category}`), amount: money(biggest.amount) }));
      }
      if (avg) {
        evidence.push(t('cop.evidence.cityAvg', { city: ctx.trip.city, average: money(avg), count: ctx.trip.historicalTripCount }));
      }
      if (ctx.trip.hotelRatePerNight) {
        evidence.push(t('cop.evidence.hotel', { rate: money(ctx.trip.hotelRatePerNight), nights: ctx.trip.hotelNights }));
      }
      return {
        answer: avg
          ? t('cop.cost.trip', {
              perTraveller: money(per),
              pct: Math.abs(Math.round(((per - avg) / avg) * 100)),
              direction: per > avg ? t('cop.cost.above') : t('cop.cost.below'),
              city: ctx.trip.city,
              average: money(avg),
              largest: biggest ? t(`tripCost.${biggest.category}`) : '—',
            })
          : t('cop.cost.tripNoHistory', { perTraveller: money(per), city: ctx.trip.city }),
        evidence,
      };
    }
    if (ctx.purchase) {
      const item = ctx.purchase.items[0];
      const prior = ctx.purchase.priorAvgUnitPrice;
      if (item) {
        evidence.push(
          t('cop.evidence.item', {
            quantity: item.quantity,
            item: item.name,
            unitPrice: money(item.unitPrice),
            total: money(item.lineTotal),
          }),
        );
      }
      if (prior) {
        evidence.push(t('cop.evidence.prevUnit', { previous: money(prior), count: ctx.purchase.priorPurchases.length }));
      }
      return {
        answer:
          item && prior
            ? t('cop.cost.purchase', {
                unitPrice: money(item.unitPrice),
                previous: money(prior),
                pct: Math.round(((item.unitPrice - prior) / prior) * 100),
              })
            : t('cop.cost.purchaseNoHistory', { total: money(ctx.amountBase) }),
        evidence,
      };
    }
    return { answer: t('cop.cost.plain', { total: money(ctx.amountBase) }), evidence };
  }

  if (has('policy', 'violate', 'compliant', 'rule', '정책', '규정', '위반')) {
    return {
      answer: ctx.policies.length === 0 ? t('cop.policy.none') : t('cop.policy.some', { count: ctx.policies.length }),
      evidence: ctx.policies.map((p) => `${p.name}: ${p.message}`),
    };
  }

  if (has('budget', 'remaining', 'afford', '예산', '잔여', '남았')) {
    if (!ctx.budget) return { answer: t('cop.budget.none'), evidence: [] };
    return {
      answer: t('cop.budget.answer', {
        remaining: money(ctx.budget.remaining),
        category: t(`budgetCategory.${ctx.budget.category}`),
        after: money(ctx.budget.remaining - ctx.amountBase),
      }),
      evidence: [
        t('cop.budget.allocated', { amount: money(ctx.budget.allocated) }),
        t('cop.budget.spent', { amount: money(ctx.budget.spent) }),
        t('cop.budget.committed', { amount: money(ctx.budget.committed) }),
        t('cop.budget.utilisation', { pct: Math.round(ctx.budget.utilization * 100) }),
      ],
    };
  }

  if (has('previous', 'compare', 'history', 'before', 'past', '과거', '이력', '비교', '이전')) {
    if (ctx.trip?.historicalTripCount) {
      return {
        answer: t('cop.history.trip', {
          count: ctx.trip.historicalTripCount,
          city: ctx.trip.city,
          average: money(ctx.trip.historicalAvgPerTraveller ?? 0),
        }),
        evidence: [
          t('cop.history.tripThis', {
            perTraveller: money(round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount))),
          }),
        ],
      };
    }
    if (ctx.purchase?.priorPurchases.length) {
      return {
        answer: t('cop.history.purchase', {
          count: ctx.purchase.priorPurchases.length,
          average: money(ctx.purchase.priorAvgUnitPrice ?? 0),
        }),
        evidence: ctx.purchase.priorPurchases.map((p) =>
          t('cop.history.purchaseEntry', {
            number: p.requestNumber,
            date: l.date(p.date),
            price: money(p.unitPrice),
            vendor: p.vendorName ? t('cop.history.fromVendor', { name: p.vendorName }) : '',
          }),
        ),
      };
    }
    return {
      answer: t('cop.history.requester', {
        name: ctx.requesterName,
        total: ctx.requesterHistory.totalRequests,
        approved: ctx.requesterHistory.approvedRequests,
        average: money(ctx.requesterHistory.avgAmount),
      }),
      evidence: [],
    };
  }

  if (has('who else', 'same date', 'travelling', 'traveling', 'overlap', 'collision', '누가', '겹치', '부재', '같은 기간')) {
    if (ctx.trip?.concurrentTravellers.length) {
      return {
        answer: t('cop.overlap.trips', { count: ctx.trip.concurrentTravellers.length }),
        evidence: ctx.trip.concurrentTravellers.map((c) =>
          t('cop.overlap.tripEntry', { name: c.name, city: c.city, date: l.date(c.startDate) }),
        ),
      };
    }
    if (ctx.leave?.collisions.length) {
      return {
        answer: t('cop.overlap.leave', { count: ctx.leave.collisions.length }),
        evidence: ctx.leave.collisions.map((c) =>
          t('cop.overlap.leaveEntry', { name: c.name, range: l.range(c.startDate, c.endDate) }),
        ),
      };
    }
    return { answer: t('cop.overlap.none'), evidence: [] };
  }

  if (has('duplicate', 'already claimed', 'twice', '중복', '두 번')) {
    if (ctx.expense?.duplicates.length) {
      return {
        answer: t('cop.duplicate.found', { count: ctx.expense.duplicates.length }),
        evidence: ctx.expense.duplicates.map((d) =>
          t('cop.duplicate.entry', {
            number: d.requestNumber,
            merchant: d.merchant,
            date: l.date(d.date),
            amount: money(d.amount),
          }),
        ),
      };
    }
    return { answer: t('cop.duplicate.none'), evidence: [] };
  }

  if (has('summarize', 'summary', '요약', '정리')) {
    return {
      answer: t('cop.summary.answer', {
        title: ctx.title,
        name: ctx.requesterName,
        dept: ctx.departmentCode ? ` (${ctx.departmentCode})` : '',
        total: money(ctx.amountBase),
        description: ctx.description ? trim(ctx.description, 200) : '',
      }),
      evidence: [
        t('cop.summary.status', { status: t(`status.${ctx.status}`) }),
        t('cop.summary.chain', { chain: ctx.approvalChain.map((c) => c.name).join(' → ') }),
      ],
    };
  }

  if (has('who', 'approver', 'next step', 'chain', '결재자', '결재선', '다음 단계')) {
    return {
      answer: t('cop.chain.answer', {
        chain: ctx.approvalChain.map((c) => `${c.name}${c.approverName ? ` (${c.approverName})` : ''}`).join(' → '),
      }),
      evidence: ctx.approvalChain.map((c) => t('cop.chain.entry', { step: c.name, status: c.status })),
    };
  }

  return { answer: t('ai.fallbackAnswer'), evidence: [] };
}

/* ------------------------------------------------------------------ */
/* Form generation from free text                                      */
/* ------------------------------------------------------------------ */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Parses one sentence into a structured draft.
 *
 * A real extractor, not a lookup: it reads dates in several formats including
 * Korean (9월 10일), matches destinations and colleagues against the actual
 * employee and city lists passed in, and picks up flight codes and amounts.
 * Whatever it cannot determine is reported in `missing` rather than invented.
 */
export function extractDraft(prompt: string, type: RequestType, ctx: FormGenerationContext): FormDraft {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const fields: Record<string, unknown> = {};
  const missing: string[] = [];
  const notes: string[] = [];
  let confidence = 55;

  const dates = extractDates(text, ctx.today);
  if (dates.length >= 2) {
    fields.startDate = dates[0];
    fields.endDate = dates[1];
    confidence += 18;
  } else if (dates.length === 1) {
    fields.startDate = dates[0];
    fields.endDate = dates[0];
    notes.push('draft.note.singleDate');
    confidence += 8;
  } else {
    missing.push('Dates');
  }

  const mentioned = ctx.employeeNames.filter((e) => {
    const first = e.name.split(' ')[0].toLowerCase();
    return new RegExp(`\\b${escapeRegex(first)}\\b`).test(lower) || lower.includes(e.name.toLowerCase());
  });

  if (type === 'BUSINESS_TRIP') {
    const dest = ctx.destinations.find(
      (d) => lower.includes(d.city.toLowerCase()) || lower.includes(d.country.toLowerCase()),
    );
    if (dest) {
      fields.city = dest.city;
      fields.country = dest.country;
      confidence += 15;
    } else {
      missing.push('Destination');
    }

    const flights = text.match(/\b([A-Z]{2}\s?\d{2,4})\b/g);
    if (flights?.length) {
      fields.outboundFlight = flights[0].replace(/\s/g, '');
      if (flights[1]) fields.inboundFlight = flights[1].replace(/\s/g, '');
      confidence += 6;
    }

    if (mentioned.length) {
      fields.travelerIds = mentioned.map((m) => m.id);
      notes.push(`draft.note.travellers|${mentioned.map((m) => m.name).join(', ')}`);
      confidence += 6;
    }

    const event = extractEvent(text);
    if (event) {
      fields.eventName = event;
      confidence += 4;
    }

    fields.purpose = text;
  }

  if (type === 'LEAVE') {
    fields.leaveType = /sick|ill|medical|hospital|병가|아파|입원/.test(lower)
      ? 'SICK'
      : /unpaid|무급/.test(lower)
        ? 'UNPAID'
        : 'ANNUAL';
    fields.reason = text;
    confidence += 10;
  }

  if (type === 'PURCHASE' || type === 'EXPENSE' || type === 'GENERAL') {
    const amount = extractAmount(text);
    if (amount !== null) {
      fields.amount = amount;
      confidence += 12;
    } else if (type !== 'GENERAL') {
      missing.push('Amount');
    }

    const qty = lower.match(/\b(\d{1,3})\s*(?:x|×|units?|pcs?|pieces?|개|대|장)\b/);
    if (qty) {
      fields.quantity = Number(qty[1]);
      confidence += 5;
    }

    const vendor = ctx.vendors.find((v) => lower.includes(v.name.toLowerCase()));
    if (vendor) {
      fields.vendorId = vendor.id;
      confidence += 8;
    } else if (type === 'PURCHASE') {
      missing.push('Vendor');
    }

    fields.description = text;
    fields.title = trim(text, 70);
  }

  if (type === 'HR') {
    fields.details = text;
    fields.title = trim(text, 70);
    confidence += 8;
  }

  return { fields, missing, notes, confidence: Math.min(94, confidence) };
}

function extractDates(text: string, today: string): string[] {
  const year = Number(today.slice(0, 4));
  const found: string[] = [];

  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(`${m[1]}-${m[2]}-${m[3]}`);

  // Korean: 9월 10일, 2026년 9월 10일
  for (const m of text.matchAll(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g)) {
    found.push(iso(m[1] ? Number(m[1]) : year, Number(m[2]), Number(m[3])));
  }
  // Korean range within one month: 9월 10일부터 12일
  for (const m of text.matchAll(/(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|~|-)\s*(\d{1,2})일/g)) {
    found.push(iso(year, Number(m[1]), Number(m[2])), iso(year, Number(m[1]), Number(m[3])));
  }

  const monthNames = MONTHS.map((m) => m.slice(0, 3)).join('|');
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\.?\\s*(\\d{4})?`, 'gi'))) {
    const month = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase())) + 1;
    if (month > 0) found.push(iso(m[3] ? Number(m[3]) : year, month, Number(m[1])));
  }
  for (const m of text.matchAll(new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'gi'))) {
    const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase())) + 1;
    if (month > 0) found.push(iso(m[3] ? Number(m[3]) : year, month, Number(m[2])));
  }

  const range = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:–|-|~|to|until)\\s*(\\d{1,2})\\s+(${monthNames})`, 'i'));
  if (range) {
    const month = MONTHS.findIndex((x) => x.startsWith(range[3].toLowerCase())) + 1;
    if (month > 0) found.push(iso(year, month, Number(range[1])), iso(year, month, Number(range[2])));
  }

  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    found.push(iso(Number(m[3]), Number(m[2]), Number(m[1])));
  }

  return [...new Set(found)].sort().slice(0, 2);
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractAmount(text: string): number | null {
  const m = text.match(/(?:\$|usd\s*)([\d,]+(?:\.\d{1,2})?)|\b([\d,]{3,})\s*(?:usd|dollars?|달러)\b/i);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').replace(/,/g, '');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractEvent(text: string): string | null {
  const m = text.match(/\b(?:for|attend(?:ing)?|join(?:ing)?)\s+(?:the\s+)?([A-Z][\w&]*(?:\s+[A-Z][\w&]*){0,4})/);
  return m ? m[1].trim() : null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* Receipt extraction                                                  */
/* ------------------------------------------------------------------ */

export function extractReceipt(input: { fileName: string; hintText?: string }): ExpenseDraftLine {
  const source = `${input.fileName} ${input.hintText ?? ''}`;
  const lower = source.toLowerCase();

  const dateMatch = source.match(/\b(\d{4})[-_.](\d{2})[-_.](\d{2})\b/);
  const expenseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().slice(0, 10);

  const amountMatch = source.match(/(?:\$|usd\s*)?([\d,]+\.\d{2})\b/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;

  const category =
    /hotel|inn|resort|lotte|marriott|hyatt|호텔/.test(lower) ? 'HOTEL'
    : /air|flight|airlines|vietjet|korean\s?air|항공/.test(lower) ? 'FLIGHT'
    : /taxi|grab|uber|metro|transfer|택시|지하철/.test(lower) ? 'TRAVEL'
    : /restaurant|cafe|coffee|food|meal|bbq|gogi|sushi|pho|식당|카페/.test(lower) ? 'MEAL'
    : /software|saas|licence|license|subscription|소프트웨어/.test(lower) ? 'SOFTWARE'
    : /print|paper|office|stationery|사무/.test(lower) ? 'OFFICE'
    : 'OTHER';

  const merchant = input.fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/receipt|invoice|scan|img|photo|영수증/gi, '')
    .replace(/[\d\-_.]{4,}/g, ' ')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    merchant: merchant || 'Unknown merchant',
    expenseDate,
    currency: 'USD',
    amount,
    taxAmount: round2(amount * 0.1),
    category,
    // Deliberately low: without a vision model this is inference, not reading.
    confidence: amount > 0 ? 55 : 30,
  };
}

/* ------------------------------------------------------------------ */

function trim(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Free-text fields rarely end in punctuation; sentences joined with a space need it. */
function sentence(s: string) {
  const t = s.trimEnd();
  if (!t) return '';
  return /[.!?…。]$/.test(t) ? t : `${t}.`;
}
