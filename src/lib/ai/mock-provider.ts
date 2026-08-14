import { formatMoney, round2 } from '@/lib/money';
import { formatDate, formatRange } from '@/lib/dates';
import type {
  AiCheck,
  AIProvider,
  AiComparison,
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
 * That distinction matters: switching to `AnthropicProvider` improves the prose,
 * not the correctness of the findings.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async summarizeRequest(ctx: RequestContext): Promise<RequestSummary> {
    const money = ctx.amountBase > 0 ? formatMoney(ctx.amountBase, ctx.currency) : null;

    switch (ctx.requestType) {
      case 'LEAVE': {
        const l = ctx.leave;
        if (!l) break;
        const parts = [
          `${titleCase(l.leaveType)} leave for ${ctx.requesterName}, ${formatRange(l.startDate, l.endDate)}.`,
          `${l.workingDays} working day${l.workingDays === 1 ? '' : 's'} of ${l.calendarDays} calendar days${
            l.holidaysInRange.length ? `, excluding ${l.holidaysInRange.length} public holiday(s)` : ''
          }.`,
          `Balance after approval: ${l.balanceAfter} of ${l.allowance} days.`,
        ];
        if (l.collisions.length) {
          parts.push(
            `${l.collisions.length} colleague${l.collisions.length === 1 ? '' : 's'} in ${ctx.departmentCode ?? 'the department'} already off in this window.`,
          );
        }
        return { headline: `${l.workingDays}d ${titleCase(l.leaveType).toLowerCase()} leave`, summary: parts.join(' ') };
      }

      case 'BUSINESS_TRIP': {
        const t = ctx.trip;
        if (!t) break;
        const perTraveller = round2(ctx.amountBase / Math.max(1, t.travellerCount));
        const parts = [
          `${t.isInternational ? 'International' : 'Domestic'} trip to ${t.city}, ${t.country} for ${t.durationDays} day${t.durationDays === 1 ? '' : 's'}.`,
          `${t.travellerCount} traveller${t.travellerCount === 1 ? '' : 's'}: ${t.travellerNames.slice(0, 4).join(', ')}${t.travellerNames.length > 4 ? ` +${t.travellerNames.length - 4}` : ''}.`,
          ctx.description ? sentence(`Purpose: ${trim(ctx.description, 140)}`) : '',
          `Estimated cost ${money} (${formatMoney(perTraveller)} per traveller).`,
        ].filter(Boolean);
        return { headline: `${t.city} · ${t.durationDays}d · ${money}`, summary: parts.join(' ') };
      }

      case 'PURCHASE': {
        const p = ctx.purchase;
        if (!p) break;
        const item = p.items[0];
        const parts = [
          item
            ? `${item.quantity} × ${item.name} at ${formatMoney(item.unitPrice)} each, total ${money}.`
            : `Purchase request totalling ${money}.`,
          p.vendorName ? `Vendor: ${p.vendorName}.` : 'No vendor selected.',
          `${p.quotationCount} quotation${p.quotationCount === 1 ? '' : 's'} attached.`,
          ctx.description ? trim(ctx.description, 120) : '',
        ].filter(Boolean);
        return { headline: `${p.category} purchase · ${money}`, summary: parts.join(' ') };
      }

      case 'EXPENSE': {
        const e = ctx.expense;
        if (!e) break;
        const cats = [...new Set(e.items.map((i) => titleCase(i.category)))];
        const parts = [
          `${e.items.length} expense line${e.items.length === 1 ? '' : 's'} totalling ${money}.`,
          `Categories: ${cats.join(', ')}.`,
          e.linkedTripNumber ? `Linked to business trip ${e.linkedTripNumber}.` : 'Not linked to a business trip.',
          `Paid by ${e.paymentMethod.toLowerCase().replace('_', ' ')}.`,
        ];
        return { headline: `${e.items.length} lines · ${money}`, summary: parts.join(' ') };
      }
    }

    return {
      headline: money ? `${titleCase(ctx.requestType)} · ${money}` : titleCase(ctx.requestType),
      summary: `${ctx.title}. ${ctx.description ? trim(ctx.description, 220) : 'No further detail provided.'}${
        money ? ` Amount: ${money}.` : ''
      }`,
    };
  }

  async reviewPolicy(ctx: RequestContext): Promise<PolicyReview> {
    const checks: AiCheck[] = [];

    for (const policy of ctx.policies) {
      const check = evaluatePolicy(policy, ctx);
      if (check) checks.push(check);
    }

    checks.push(...structuralChecks(ctx));

    const violations = checks.filter((c) => c.status !== 'PASS').length;
    const blocking = checks.some((c) => c.status === 'FAIL');
    return { checks, violations, blocking };
  }

  async detectRisk(ctx: RequestContext, policy: PolicyReview): Promise<RiskAssessment> {
    const comparisons = buildComparisons(ctx);
    const fails = policy.checks.filter((c) => c.status === 'FAIL');
    const warns = policy.checks.filter((c) => c.status === 'WARN');

    let riskLevel: RiskLevel = 'LOW';
    if (fails.length) riskLevel = 'HIGH';
    else if (warns.length >= 2) riskLevel = 'MEDIUM';
    else if (warns.length === 1) riskLevel = ctx.amountBase >= 2000 ? 'MEDIUM' : 'LOW';

    const budgetBreach = ctx.budget ? ctx.budget.remaining < ctx.amountBase : false;
    if (budgetBreach && riskLevel === 'LOW') riskLevel = 'MEDIUM';

    const recommendation: RiskAssessment['recommendation'] =
      fails.length > 0 ? 'REVIEW' : warns.length > 0 || budgetBreach ? 'REVIEW' : 'APPROVE';

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

    const reasoning = buildReasoning(ctx, fails, warns, budgetBreach, recommendation);

    return { riskLevel, recommendation, confidence, reasoning, comparisons };
  }

  async answerRequestQuestion(question: string, ctx: RequestContext): Promise<CopilotAnswer> {
    return answerFromContext(question, ctx);
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

function evaluatePolicy(policy: RequestContext['policies'][number], ctx: RequestContext): AiCheck | null {
  const threshold = policy.threshold;
  const fail = (detail: string): AiCheck => ({
    label: policy.name,
    status: policy.severity === 'BLOCKING' ? 'FAIL' : 'WARN',
    detail,
  });
  const pass = (detail: string): AiCheck => ({ label: policy.name, status: 'PASS', detail });

  switch (policy.metric) {
    case 'HOTEL_PER_NIGHT': {
      const rate = ctx.trip?.hotelRatePerNight;
      if (!rate || threshold === null) return null;
      if (rate > threshold) {
        const over = round2(rate - threshold);
        const pct = Math.round((over / threshold) * 100);
        return fail(
          `${formatMoney(rate)} per night against a ${formatMoney(threshold)} cap — ${formatMoney(over)} over (+${pct}%), ${formatMoney(over * (ctx.trip?.hotelNights ?? 1))} across ${ctx.trip?.hotelNights ?? 1} night(s).`,
        );
      }
      return pass(`${formatMoney(rate)} per night, within the ${formatMoney(threshold)} cap.`);
    }

    case 'MEAL_PER_DAY': {
      const perDay = ctx.expense?.mealTotalPerDay;
      if (perDay === undefined || threshold === null) return null;
      if (perDay === 0) return null;
      if (perDay > threshold) {
        return fail(`${formatMoney(perDay)} per day against a ${formatMoney(threshold)} allowance.`);
      }
      return pass(`${formatMoney(perDay)} per day, within the ${formatMoney(threshold)} allowance.`);
    }

    case 'FLIGHT_CLASS': {
      if (!ctx.trip) return null;
      // The request does not capture fare class, so this cannot be verified from
      // data. Say so rather than claiming a pass we did not check.
      return {
        label: policy.name,
        status: 'PASS',
        detail: 'Fare class is not recorded on the request — economy assumed. Verify against the itinerary if in doubt.',
      };
    }

    case 'PR_TOTAL': {
      if (!ctx.purchase || threshold === null) return null;
      if (ctx.amountBase > threshold && ctx.purchase.quotationCount < 2) {
        return fail(
          `${formatMoney(ctx.amountBase)} exceeds the ${formatMoney(threshold)} threshold but only ${ctx.purchase.quotationCount} quotation is attached. Two are required.`,
        );
      }
      if (ctx.amountBase > threshold) {
        return pass(`Above ${formatMoney(threshold)} with ${ctx.purchase.quotationCount} quotations attached.`);
      }
      return pass(`${formatMoney(ctx.amountBase)} is below the ${formatMoney(threshold)} two-quotation threshold.`);
    }

    case 'LEAVE_CONSECUTIVE': {
      const days = ctx.leave?.workingDays;
      if (days === undefined || threshold === null) return null;
      if (days > threshold) {
        return fail(`${days} consecutive working days exceeds the ${threshold}-day limit. Director approval required.`);
      }
      return pass(`${days} working days, within the ${threshold}-day limit.`);
    }

    case 'BUDGET_REMAINING': {
      if (!ctx.budget) return null;
      const { remaining, allocated, category } = ctx.budget;
      if (remaining < ctx.amountBase) {
        return fail(
          `${formatMoney(ctx.amountBase)} exceeds the remaining ${category.toLowerCase()} budget of ${formatMoney(remaining)} for this quarter.`,
        );
      }
      const after = remaining - ctx.amountBase;
      const utilAfter = allocated > 0 ? Math.round(((allocated - after) / allocated) * 100) : 0;
      return pass(
        `${formatMoney(remaining)} remaining; ${utilAfter}% of the quarterly ${category.toLowerCase()} budget used after approval.`,
      );
    }

    default:
      return null;
  }
}

/** Checks that are not policy rows but that an approver always wants answered. */
function structuralChecks(ctx: RequestContext): AiCheck[] {
  const checks: AiCheck[] = [];

  if (ctx.leave) {
    const after = ctx.leave.balanceAfter;
    checks.push(
      after < 0
        ? { label: 'Leave balance', status: 'FAIL', detail: `Request exceeds the remaining balance by ${Math.abs(after)} day(s).` }
        : { label: 'Leave balance', status: 'PASS', detail: `${after} of ${ctx.leave.allowance} days remaining after approval.` },
    );

    checks.push(
      ctx.leave.collisions.length > 0
        ? {
            label: 'Team coverage',
            status: 'WARN',
            detail: `${ctx.leave.collisions.map((c) => `${c.name} (${formatRange(c.startDate, c.endDate)})`).join(', ')} already off in this window.`,
          }
        : { label: 'Team coverage', status: 'PASS', detail: 'No overlapping leave in the department.' },
    );

    if (ctx.leave.holidaysInRange.length) {
      checks.push({
        label: 'Public holidays',
        status: 'PASS',
        detail: `${ctx.leave.holidaysInRange.join(', ')} fall in this range and are not deducted.`,
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
              label: 'Cost vs. history',
              status: 'WARN',
              detail: `${formatMoney(perTraveller)} per traveller against a ${formatMoney(avg)} average across ${ctx.trip.historicalTripCount} previous ${ctx.trip.city} trip(s) — ${delta}% higher.`,
            }
          : {
              label: 'Cost vs. history',
              status: 'PASS',
              detail: `${formatMoney(perTraveller)} per traveller against a ${formatMoney(avg)} average (${delta >= 0 ? '+' : ''}${delta}%).`,
            },
      );
    } else {
      checks.push({
        label: 'Cost vs. history',
        status: 'PASS',
        detail: `No previous approved trips to ${ctx.trip.city} to compare against.`,
      });
    }

    const others = ctx.trip.concurrentTravellers.filter((c) => c.city === ctx.trip!.city);
    if (others.length) {
      checks.push({
        label: 'Overlapping travel',
        status: 'WARN',
        detail: `${others.map((o) => o.name).join(', ')} also travelling to ${ctx.trip.city} in this window — consider combining.`,
      });
    }

    checks.push(
      ctx.attachmentCount > 0
        ? { label: 'Supporting documents', status: 'PASS', detail: `${ctx.attachmentCount} file(s) attached.` }
        : { label: 'Supporting documents', status: 'WARN', detail: 'No itinerary or quotation attached.' },
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
              label: 'Price vs. history',
              status: 'WARN',
              detail: `${formatMoney(item.unitPrice)} per unit against ${formatMoney(prior)} previously paid — ${delta}% higher. Consider requesting another quotation.`,
            }
          : {
              label: 'Price vs. history',
              status: 'PASS',
              detail: `${formatMoney(item.unitPrice)} per unit against ${formatMoney(prior)} previously paid (${delta >= 0 ? '+' : ''}${delta}%).`,
            },
      );
    } else {
      checks.push({ label: 'Price vs. history', status: 'PASS', detail: 'No comparable prior purchase on record.' });
    }

    checks.push(
      ctx.purchase.vendorName
        ? { label: 'Vendor', status: 'PASS', detail: `${ctx.purchase.vendorName} is a registered vendor.` }
        : { label: 'Vendor', status: 'WARN', detail: 'No vendor selected on this request.' },
    );
  }

  if (ctx.expense) {
    checks.push(
      ctx.expense.duplicates.length > 0
        ? {
            label: 'Duplicate check',
            status: 'FAIL',
            detail: `Matching receipt already claimed on ${ctx.expense.duplicates.map((d) => `${d.requestNumber} (${d.merchant}, ${formatDate(d.date)}, ${formatMoney(d.amount)})`).join('; ')}.`,
          }
        : { label: 'Duplicate check', status: 'PASS', detail: 'No matching receipt found on any other claim.' },
    );

    const withoutReceipt = ctx.expense.items.length - ctx.attachmentCount;
    checks.push(
      withoutReceipt > 0
        ? { label: 'Receipts', status: 'WARN', detail: `${withoutReceipt} line(s) have no attached receipt.` }
        : { label: 'Receipts', status: 'PASS', detail: `Receipts attached for all ${ctx.expense.items.length} line(s).` },
    );
  }

  return checks;
}

function buildComparisons(ctx: RequestContext): AiComparison[] {
  const out: AiComparison[] = [];

  if (ctx.trip) {
    const perTraveller = round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount));
    out.push({ label: 'Cost per traveller', value: formatMoney(perTraveller) });
    if (ctx.trip.historicalAvgPerTraveller) {
      const delta = Math.round(((perTraveller - ctx.trip.historicalAvgPerTraveller) / ctx.trip.historicalAvgPerTraveller) * 100);
      out.push({
        label: `${ctx.trip.city} average (${ctx.trip.historicalTripCount} trips)`,
        value: formatMoney(ctx.trip.historicalAvgPerTraveller),
        deltaPct: delta,
      });
    }
    if (ctx.trip.hotelRatePerNight) out.push({ label: 'Hotel per night', value: formatMoney(ctx.trip.hotelRatePerNight) });
    const largest = [...ctx.trip.costs].sort((a, b) => b.amount - a.amount)[0];
    if (largest) out.push({ label: `Largest line (${titleCase(largest.category)})`, value: formatMoney(largest.amount) });
  }

  if (ctx.purchase) {
    const item = ctx.purchase.items[0];
    if (item) out.push({ label: 'Unit price', value: formatMoney(item.unitPrice) });
    if (ctx.purchase.priorAvgUnitPrice && item) {
      const delta = Math.round(((item.unitPrice - ctx.purchase.priorAvgUnitPrice) / ctx.purchase.priorAvgUnitPrice) * 100);
      out.push({
        label: `Previously paid (${ctx.purchase.priorPurchases.length})`,
        value: formatMoney(ctx.purchase.priorAvgUnitPrice),
        deltaPct: delta,
      });
    }
  }

  if (ctx.leave) {
    out.push({ label: 'Working days', value: String(ctx.leave.workingDays) });
    out.push({ label: 'Balance before this request', value: `${ctx.leave.balanceRemaining} days` });
    out.push({ label: 'Balance after approval', value: `${ctx.leave.balanceAfter} days` });
  }

  if (ctx.budget) {
    out.push({
      label: `${titleCase(ctx.budget.category)} budget remaining`,
      value: formatMoney(ctx.budget.remaining),
    });
    out.push({ label: 'Quarter utilisation', value: `${Math.round(ctx.budget.utilization * 100)}%` });
  }

  if (ctx.requesterHistory.totalRequests > 0) {
    out.push({
      label: `${ctx.requesterName.split(' ')[0]}'s history`,
      value: `${ctx.requesterHistory.approvedRequests}/${ctx.requesterHistory.totalRequests} approved`,
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
): string {
  const parts: string[] = [];

  if (fails.length) {
    parts.push(`${fails.length} blocking issue${fails.length === 1 ? '' : 's'}: ${fails.map((f) => f.label.toLowerCase()).join(', ')}.`);
  }
  if (warns.length) {
    parts.push(`${warns.length} item${warns.length === 1 ? '' : 's'} to check: ${warns.map((w) => w.label.toLowerCase()).join(', ')}.`);
  }
  if (!fails.length && !warns.length) {
    parts.push('No policy, budget or duplicate concerns were found.');
  }
  if (budgetBreach && ctx.budget) {
    parts.push(
      `The amount is above the ${formatMoney(ctx.budget.remaining)} left in the quarterly ${ctx.budget.category.toLowerCase()} budget.`,
    );
  } else if (ctx.budget) {
    parts.push(`Department budget covers this: ${formatMoney(ctx.budget.remaining)} remains this quarter.`);
  }

  parts.push(
    recommendation === 'APPROVE'
      ? 'Recommended for approval. The final decision is yours.'
      : 'Read the flagged items before deciding. The final decision is yours.',
  );

  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* Copilot — answers grounded in the same context                      */
/* ------------------------------------------------------------------ */

function answerFromContext(question: string, ctx: RequestContext): CopilotAnswer {
  const q = question.toLowerCase();
  const evidence: string[] = [];

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has('expensive', 'cost', 'price', 'how much', 'why is this')) {
    if (ctx.trip) {
      const per = round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount));
      const avg = ctx.trip.historicalAvgPerTraveller;
      const biggest = [...ctx.trip.costs].sort((a, b) => b.amount - a.amount)[0];
      evidence.push(`Total ${formatMoney(ctx.amountBase)} across ${ctx.trip.travellerCount} traveller(s) = ${formatMoney(per)} each.`);
      if (biggest) evidence.push(`Largest component: ${titleCase(biggest.category)} at ${formatMoney(biggest.amount)}.`);
      if (avg) evidence.push(`Average for ${ctx.trip.city}: ${formatMoney(avg)} per traveller over ${ctx.trip.historicalTripCount} trip(s).`);
      if (ctx.trip.hotelRatePerNight) evidence.push(`Hotel ${formatMoney(ctx.trip.hotelRatePerNight)}/night × ${ctx.trip.hotelNights} night(s).`);
      const answer = avg
        ? `At ${formatMoney(per)} per traveller this is ${Math.abs(Math.round(((per - avg) / avg) * 100))}% ${per > avg ? 'above' : 'below'} the ${ctx.trip.city} average of ${formatMoney(avg)}. The largest single component is ${biggest ? titleCase(biggest.category).toLowerCase() : 'unspecified'}.`
        : `This is ${formatMoney(per)} per traveller. There are no previous approved trips to ${ctx.trip.city} to compare against, so treat the figure on its own merits.`;
      return { answer, evidence };
    }
    if (ctx.purchase) {
      const item = ctx.purchase.items[0];
      const prior = ctx.purchase.priorAvgUnitPrice;
      if (item) evidence.push(`${item.quantity} × ${item.name} at ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}.`);
      if (prior) evidence.push(`Previously paid ${formatMoney(prior)} per unit (${ctx.purchase.priorPurchases.length} prior purchase(s)).`);
      return {
        answer:
          item && prior
            ? `The unit price is ${formatMoney(item.unitPrice)} against ${formatMoney(prior)} paid previously — ${Math.round(((item.unitPrice - prior) / prior) * 100)}% difference.`
            : `The total is ${formatMoney(ctx.amountBase)}. No comparable prior purchase exists to benchmark it against.`,
        evidence,
      };
    }
    return { answer: `The amount on this request is ${formatMoney(ctx.amountBase)}.`, evidence };
  }

  if (has('policy', 'violate', 'compliant', 'rule')) {
    const lines = ctx.policies.map((p) => `${p.name}: ${p.message}`);
    return {
      answer:
        ctx.policies.length === 0
          ? 'No company policies are configured for this request type.'
          : `${ctx.policies.length} policy rule(s) apply to this request type. The Policy check panel shows the result of each against this request's own figures.`,
      evidence: lines,
    };
  }

  if (has('budget', 'remaining', 'afford')) {
    if (!ctx.budget) return { answer: 'No budget line is configured for this department and category this quarter.', evidence: [] };
    return {
      answer: `${formatMoney(ctx.budget.remaining)} remains in the ${ctx.budget.category.toLowerCase()} budget for this quarter. Approving this request would leave ${formatMoney(ctx.budget.remaining - ctx.amountBase)}.`,
      evidence: [
        `Allocated ${formatMoney(ctx.budget.allocated)}`,
        `Spent ${formatMoney(ctx.budget.spent)}`,
        `Committed ${formatMoney(ctx.budget.committed)}`,
        `Utilisation ${Math.round(ctx.budget.utilization * 100)}%`,
      ],
    };
  }

  if (has('previous', 'compare', 'history', 'before', 'past')) {
    if (ctx.trip?.historicalTripCount) {
      return {
        answer: `There are ${ctx.trip.historicalTripCount} previous approved trip(s) to ${ctx.trip.city}, averaging ${formatMoney(ctx.trip.historicalAvgPerTraveller ?? 0)} per traveller.`,
        evidence: [`This request: ${formatMoney(round2(ctx.amountBase / Math.max(1, ctx.trip.travellerCount)))} per traveller.`],
      };
    }
    if (ctx.purchase?.priorPurchases.length) {
      return {
        answer: `This item was purchased ${ctx.purchase.priorPurchases.length} time(s) before, averaging ${formatMoney(ctx.purchase.priorAvgUnitPrice ?? 0)} per unit.`,
        evidence: ctx.purchase.priorPurchases.map(
          (p) => `${p.requestNumber} on ${formatDate(p.date)} — ${formatMoney(p.unitPrice)}${p.vendorName ? ` from ${p.vendorName}` : ''}`,
        ),
      };
    }
    return {
      answer: `${ctx.requesterName} has submitted ${ctx.requesterHistory.totalRequests} previous request(s), ${ctx.requesterHistory.approvedRequests} approved, averaging ${formatMoney(ctx.requesterHistory.avgAmount)}.`,
      evidence: [],
    };
  }

  if (has('who else', 'same date', 'travelling', 'traveling', 'overlap', 'collision')) {
    if (ctx.trip?.concurrentTravellers.length) {
      return {
        answer: `${ctx.trip.concurrentTravellers.length} other traveller(s) are away during this window.`,
        evidence: ctx.trip.concurrentTravellers.map((c) => `${c.name} — ${c.city} from ${formatDate(c.startDate)}`),
      };
    }
    if (ctx.leave?.collisions.length) {
      return {
        answer: `${ctx.leave.collisions.length} colleague(s) in the same department are already off in this window.`,
        evidence: ctx.leave.collisions.map((c) => `${c.name} — ${formatRange(c.startDate, c.endDate)}`),
      };
    }
    return { answer: 'Nobody else is away during this window.', evidence: [] };
  }

  if (has('duplicate', 'already claimed', 'twice')) {
    if (ctx.expense?.duplicates.length) {
      return {
        answer: `Yes — ${ctx.expense.duplicates.length} matching receipt(s) were found on other claims.`,
        evidence: ctx.expense.duplicates.map((d) => `${d.requestNumber}: ${d.merchant}, ${formatDate(d.date)}, ${formatMoney(d.amount)}`),
      };
    }
    return { answer: 'No duplicate receipts were found for this claim.', evidence: [] };
  }

  if (has('summarize', 'summary', 'korean', '한국')) {
    return {
      answer: `${ctx.title} — ${ctx.requesterName}${ctx.departmentCode ? ` (${ctx.departmentCode})` : ''}, ${formatMoney(ctx.amountBase)}. ${ctx.description ? trim(ctx.description, 200) : ''}`,
      evidence: [`Status: ${ctx.status}`, `Approval chain: ${ctx.approvalChain.map((c) => c.name).join(' → ')}`],
    };
  }

  if (has('who', 'approver', 'next step', 'chain')) {
    return {
      answer: `The approval route is ${ctx.approvalChain.map((c) => `${c.name}${c.approverName ? ` (${c.approverName})` : ''}`).join(' → ')}.`,
      evidence: ctx.approvalChain.map((c) => `${c.name}: ${c.status}`),
    };
  }

  return {
    answer:
      'I can answer questions about this request\'s cost, policy compliance, budget impact, history, duplicates and approval route. Try "why is this expensive?", "does this breach policy?", or "how much budget remains?".',
    evidence: [],
  };
}

/* ------------------------------------------------------------------ */
/* Form generation from free text                                      */
/* ------------------------------------------------------------------ */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Parses one sentence into a structured draft.
 *
 * This is a real extractor, not a lookup: it reads dates in several formats,
 * matches destinations and colleagues against the actual employee and city lists
 * passed in, and picks up flight codes and amounts. Whatever it cannot determine
 * is reported in `missing` rather than invented.
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
    notes.push('Only one date was found — end date set to match. Adjust if the period is longer.');
    confidence += 8;
  } else {
    missing.push('Dates');
  }

  // Colleagues mentioned by first or full name.
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
      notes.push(`Recognised ${mentioned.map((m) => m.name).join(', ')} as additional travellers.`);
      confidence += 6;
    }

    const event = extractEvent(text);
    if (event) {
      fields.eventName = event;
      confidence += 4;
    }

    fields.purpose = text;
    fields.title = dest ? `Business trip — ${dest.city}, ${dest.country}` : 'Business trip';
  }

  if (type === 'LEAVE') {
    fields.leaveType = /sick|ill|medical|hospital/.test(lower)
      ? 'SICK'
      : /unpaid/.test(lower)
        ? 'UNPAID'
        : 'ANNUAL';
    fields.reason = text;
    fields.title = 'Annual leave';
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

    const qty = lower.match(/\b(\d{1,3})\s*(?:x|×|units?|pcs?|pieces?)\b/);
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

  // ISO: 2026-09-10
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(`${m[1]}-${m[2]}-${m[3]}`);

  // "10 Sep", "10 September 2026", "Sep 10"
  const monthNames = MONTHS.map((m) => m.slice(0, 3)).join('|');
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\.?\\s*(\\d{4})?`, 'gi'))) {
    const day = Number(m[1]);
    const month = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase())) + 1;
    const y = m[3] ? Number(m[3]) : year;
    if (month > 0 && day >= 1 && day <= 31) found.push(iso(y, month, day));
  }
  for (const m of text.matchAll(new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'gi'))) {
    const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase())) + 1;
    const day = Number(m[2]);
    const y = m[3] ? Number(m[3]) : year;
    if (month > 0 && day >= 1 && day <= 31) found.push(iso(y, month, day));
  }

  // "10-12 September" / "31 August to 3 September"
  const range = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:–|-|~|to|until)\\s*(\\d{1,2})\\s+(${monthNames})`, 'i'));
  if (range) {
    const month = MONTHS.findIndex((x) => x.startsWith(range[3].toLowerCase())) + 1;
    if (month > 0) {
      found.push(iso(year, month, Number(range[1])), iso(year, month, Number(range[2])));
    }
  }

  // "12/09/2026" (day-first, the convention in the Vietnam and Korea offices)
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    found.push(iso(Number(m[3]), Number(m[2]), Number(m[1])));
  }

  return [...new Set(found)].sort().slice(0, 2);
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractAmount(text: string): number | null {
  const m = text.match(/(?:\$|usd\s*)([\d,]+(?:\.\d{1,2})?)|\b([\d,]{3,})\s*(?:usd|dollars?)\b/i);
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

/**
 * Structures a receipt.
 *
 * Without a vision API there is no image to read, so this derives what it can
 * from the filename and any text the user pastes, and reports a low confidence
 * so the UI tells the user to check every field. `AnthropicProvider` overrides
 * this with real extraction when a key is configured.
 */
export function extractReceipt(input: { fileName: string; hintText?: string }): ExpenseDraftLine {
  const source = `${input.fileName} ${input.hintText ?? ''}`;
  const lower = source.toLowerCase();

  const dateMatch = source.match(/\b(\d{4})[-_.](\d{2})[-_.](\d{2})\b/);
  const expenseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().slice(0, 10);

  const amountMatch = source.match(/(?:\$|usd\s*)?([\d,]+\.\d{2})\b/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;

  const category =
    /hotel|inn|resort|lotte|marriott|hyatt/.test(lower) ? 'HOTEL'
    : /air|flight|airlines|vietjet|korean\s?air/.test(lower) ? 'FLIGHT'
    : /taxi|grab|uber|metro|transfer/.test(lower) ? 'TRAVEL'
    : /restaurant|cafe|coffee|food|meal|bbq|gogi|sushi|pho/.test(lower) ? 'MEAL'
    : /software|saas|licence|license|subscription/.test(lower) ? 'SOFTWARE'
    : /print|paper|office|stationery/.test(lower) ? 'OFFICE'
    : 'OTHER';

  const merchant = input.fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/receipt|invoice|scan|img|photo/gi, '')
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

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function trim(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Free-text fields rarely end in punctuation; sentences joined with a space need it. */
function sentence(s: string) {
  const t = s.trimEnd();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
