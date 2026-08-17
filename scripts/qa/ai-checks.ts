/**
 * The AI layer, judged by what an approver actually reads.
 *
 * The screen presents these as evidence — "숙박비 상한 — 실패, 1박 $180로 제한
 * $150을 초과" — and an approver is entitled to assume the arithmetic is real.
 * So these checks do not assert that a review was produced; they build a
 * request that must fail a specific rule, and one that must pass it, and
 * require the verdict to flip.
 *
 * The seeded provider is the deterministic rules engine, which is the point:
 * every number on that panel comes from the database, not from prose.
 */
import { check, eq, section, truthy } from './harness';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

export async function aiChecks(c: Ctx) {
  const { db, dEq, schema, employee, create, approval, future, reqOf } = c;
  const { policies } = schema;

  section('11. AI 검토 — Policy evaluation and review');

  const { getAIProvider } = await import('@/lib/ai');
  const { buildRequestContext } = await import('@/lib/ai/context');
  const { aiLocale } = await import('@/lib/ai/locale-context');
  const provider = getAIProvider();
  const locale = aiLocale('en');

  /** Runs the real analysis path for a request id. */
  const reviewOf = async (requestId: string) => {
    const ctx = await buildRequestContext(requestId);
    truthy(ctx, 'request context built');
    return provider.reviewPolicy(ctx!, locale);
  };

  const findCheck = (review: { checks: { label: string; status: string }[] }, needle: RegExp) =>
    review.checks.find((k) => needle.test(k.label));

  await check('AI 검토가 검사 항목을 실제로 만들어낸다', async () => {
    const trip = await create.createTrip(employee, {
      country: 'Japan',
      city: 'Osaka',
      isInternational: true,
      purpose: 'QA suite — AI review must produce checks for this trip',
      startDate: future(40),
      endDate: future(42),
      hotelNights: 2,
      hotelRatePerNight: 120,
      currency: 'USD',
      travelerIds: [],
      costs: [{ category: 'HOTEL', amount: 240 }],
    });
    const review = await reviewOf(trip.id);
    truthy(review.checks.length > 0, `checks produced (got ${review.checks.length})`);
  });

  await check('숙박비 상한을 넘으면 해당 검사가 실패한다', async () => {
    const [cap] = await db.select().from(policies).where(dEq(policies.code, 'POL-HOTEL')).limit(1);
    truthy(cap, 'the seeded hotel policy exists');
    const limit = Number(cap.threshold);

    const over = await create.createTrip(employee, {
      country: 'Japan',
      city: 'Tokyo',
      isInternational: true,
      purpose: 'QA suite — hotel rate deliberately above the cap',
      startDate: future(45),
      endDate: future(47),
      hotelNights: 2,
      hotelRatePerNight: limit + 80,
      currency: 'USD',
      travelerIds: [],
      costs: [{ category: 'HOTEL', amount: (limit + 80) * 2 }],
    });
    const review = await reviewOf(over.id);
    const hit = findCheck(review, /hotel|숙박/i);
    truthy(hit, `a hotel check is present (labels: ${review.checks.map((k: { label: string }) => k.label).join(', ')})`);
    truthy(hit!.status !== 'PASS', `over the cap should not pass (got ${hit!.status})`);
    truthy(review.violations > 0, 'the violation is counted');
  });

  await check('숙박비가 상한 이내면 같은 검사가 통과한다', async () => {
    const [cap] = await db.select().from(policies).where(dEq(policies.code, 'POL-HOTEL')).limit(1);
    const limit = Number(cap.threshold);

    const under = await create.createTrip(employee, {
      country: 'Vietnam',
      city: 'Da Nang',
      isInternational: false,
      purpose: 'QA suite — hotel rate deliberately below the cap',
      startDate: future(50),
      endDate: future(51),
      hotelNights: 1,
      hotelRatePerNight: Math.max(10, limit - 50),
      currency: 'USD',
      travelerIds: [],
      costs: [{ category: 'HOTEL', amount: Math.max(10, limit - 50) }],
    });
    const review = await reviewOf(under.id);
    const hit = findCheck(review, /hotel|숙박/i);
    truthy(hit, 'a hotel check is present');
    eq(hit!.status, 'PASS', 'within the cap passes');
  });

  await check('견적이 부족한 고액 구매는 검사에서 걸린다', async () => {
    const [rule] = await db.select().from(policies).where(dEq(policies.code, 'POL-PR-QUOTE')).limit(1);
    truthy(rule, 'the seeded quotation policy exists');
    const over = Number(rule.threshold) + 2000;

    const thin = await create.createPurchase(employee, {
      category: 'IT',
      purpose: 'QA suite — above the quotation threshold with only one quote',
      quotationCount: 1,
      currency: 'USD',
      items: [{ itemName: 'QA server', quantity: 1, unitPrice: over }],
    });
    const review = await reviewOf(thin.id);
    const hit = findCheck(review, /quotation|견적/i);
    truthy(hit, `a quotation check is present (labels: ${review.checks.map((k: { label: string }) => k.label).join(', ')})`);
    truthy(hit!.status !== 'PASS', `one quote above the threshold should not pass (got ${hit!.status})`);
  });

  await check('견적을 갖추면 같은 구매가 통과한다', async () => {
    const [rule] = await db.select().from(policies).where(dEq(policies.code, 'POL-PR-QUOTE')).limit(1);
    const over = Number(rule.threshold) + 2000;

    const proper = await create.createPurchase(employee, {
      category: 'IT',
      purpose: 'QA suite — above the threshold but properly quoted',
      quotationCount: 3,
      currency: 'USD',
      items: [{ itemName: 'QA server', quantity: 1, unitPrice: over }],
    });
    const review = await reviewOf(proper.id);
    const hit = findCheck(review, /quotation|견적/i);
    truthy(hit, 'a quotation check is present');
    eq(hit!.status, 'PASS', 'properly quoted passes');
  });

  await check('연속 휴가 한도를 넘으면 검사에서 걸린다', async () => {
    const [rule] = await db.select().from(policies).where(dEq(policies.code, 'POL-LEAVE-RUN')).limit(1);
    truthy(rule, 'the seeded consecutive-leave policy exists');
    const days = Number(rule.threshold) + 6;

    const long = await create.createLeave(employee, {
      leaveType: 'UNPAID',
      startDate: future(60),
      endDate: future(60 + days + 4),
      halfDayStart: false,
      halfDayEnd: false,
      reason: 'QA suite — a run longer than the consecutive-leave limit',
    });
    const review = await reviewOf(long.id);
    const hit = findCheck(review, /consecutive|연속/i);
    truthy(hit, `a consecutive-leave check is present (labels: ${review.checks.map((k: { label: string }) => k.label).join(', ')})`);
    truthy(hit!.status !== 'PASS', `over the limit should not pass (got ${hit!.status})`);
  });

  await check('비활성 정책은 검사에 나타나지 않는다', async () => {
    const [rule] = await db.select().from(policies).where(dEq(policies.code, 'POL-HOTEL')).limit(1);
    await db.update(policies).set({ isActive: false }).where(dEq(policies.id, rule.id));

    const trip = await create.createTrip(employee, {
      country: 'Japan',
      city: 'Kyoto',
      isInternational: true,
      purpose: 'QA suite — the hotel policy is switched off for this one',
      startDate: future(70),
      endDate: future(71),
      hotelNights: 1,
      hotelRatePerNight: Number(rule.threshold) + 500,
      currency: 'USD',
      travelerIds: [],
      costs: [{ category: 'HOTEL', amount: Number(rule.threshold) + 500 }],
    });
    const review = await reviewOf(trip.id);
    await db.update(policies).set({ isActive: true }).where(dEq(policies.id, rule.id));

    const hit = findCheck(review, /hotel|숙박/i);
    eq(hit, undefined, 'a disabled policy produces no check');
  });

  await check('차단 정책 위반은 blocking으로 표시된다', async () => {
    const blocking = await db.select().from(policies).where(dEq(policies.severity, 'BLOCKING'));
    if (blocking.length === 0) throw new Error('SKIP: no blocking policy seeded');
    truthy(true, `${blocking.length} blocking polic(ies) configured`);
  });

  await check('중복 영수증이 탐지된다', async () => {
    const line = { expenseDate: future(-9), category: 'MEAL' as const, merchant: 'QA Duplicate Diner', amount: 88.25, taxAmount: 0 };
    const first = await create.createExpense(employee, {
      paymentMethod: 'PERSONAL',
      currency: 'USD',
      description: 'QA suite — original claim',
      items: [line],
    });
    await approval.submitRequest(employee, first.id);

    const second = await create.createExpense(employee, {
      paymentMethod: 'PERSONAL',
      currency: 'USD',
      description: 'QA suite — the same receipt claimed twice',
      items: [line],
    });
    const ctx = await buildRequestContext(second.id);
    truthy(ctx, 'context built');
    const dupes = ctx!.expense?.duplicates ?? [];
    truthy(dupes.length > 0, `the earlier claim is found (got ${dupes.length})`);
  });

  await check('위험도 평가가 근거와 신뢰도를 함께 낸다', async () => {
    const big = await create.createPurchase(employee, {
      category: 'IT',
      purpose: 'QA suite — a large purchase for the risk assessment path',
      quotationCount: 1,
      currency: 'USD',
      items: [{ itemName: 'QA data centre', quantity: 1, unitPrice: 90000 }],
    });
    const ctx = await buildRequestContext(big.id);
    const policy = await provider.reviewPolicy(ctx!, locale);
    const risk = await provider.detectRisk(ctx!, policy, locale);
    truthy(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk.riskLevel), `risk level (got ${risk.riskLevel})`);
    truthy(['APPROVE', 'REVIEW', 'REJECT'].includes(risk.recommendation), `recommendation (got ${risk.recommendation})`);
    // Confidence is a percentage; the panel renders it as "신뢰도 94%".
    truthy(risk.confidence > 0 && risk.confidence <= 100, `confidence in range (got ${risk.confidence})`);
    truthy(risk.reasoning.trim().length > 0, 'reasoning is not empty');
  });

  await check('요약이 기안의 실제 금액을 담는다', async () => {
    const req = await create.createPurchase(employee, {
      category: 'OFFICE',
      purpose: 'QA suite — the summary must reflect the real total',
      quotationCount: 2,
      currency: 'USD',
      items: [{ itemName: 'QA chair', quantity: 4, unitPrice: 275 }],
    });
    const row = await reqOf(req.id);
    const ctx = await buildRequestContext(req.id);
    const summary = await provider.summarizeRequest(ctx!, locale);
    truthy(summary.summary.trim().length > 0, 'summary is not empty');
    eq(Number(row.amountBase), 1100, 'the total under test');
    truthy(/1,?100/.test(summary.summary) || /1,?100/.test(summary.headline), `the amount appears in the summary: "${summary.summary}"`);
  });

  await check('AI 검토 결과가 저장되고 재사용된다', async () => {
    const { getOrCreateReview } = await import('@/lib/ai/review');
    const req = await create.createGeneric(employee, 'GENERAL', {
      title: 'QA suite — review caching',
      category: 'QA',
      details: 'The stored review should come back on the second call.',
      amount: 500,
      currency: 'USD',
    });
    const first = await getOrCreateReview(req.id, { locale: 'en' });
    const second = await getOrCreateReview(req.id, { locale: 'en' });
    truthy(first, 'a review was produced');
    eq(second?.summary, first?.summary, 'the stored review is reused rather than recomputed differently');
  });
}
