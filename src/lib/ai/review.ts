import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { aiReviews, requests } from '@/lib/db/schema';
import { scorePriority } from '@/lib/workflow/engine';
import { getLocale } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n/types';
import { getAIProvider } from './index';
import { aiLocale } from './locale-context';
import { buildRequestContext } from './context';
import type { FullReview } from './types';

/**
 * Returns the request's AI review, generating and caching it on first read.
 *
 * Caching matters for trust as much as for cost: an approver who opens a request,
 * leaves, and comes back must see the same assessment, not a subtly different one.
 * The cache is invalidated whenever the request itself changes.
 */
export async function getOrCreateReview(
  requestId: string,
  opts: { force?: boolean; locale?: Locale } = {},
): Promise<FullReview | null> {
  const db = await ready();
  const locale = opts.locale ?? (await getLocale());

  if (!opts.force) {
    // Cached per language: the row stores finished prose, so an English reader
    // must not be served the Korean row and vice versa.
    const [existing] = await db
      .select()
      .from(aiReviews)
      .where(and(eq(aiReviews.requestId, requestId), eq(aiReviews.locale, locale)))
      .orderBy(desc(aiReviews.createdAt))
      .limit(1);
    if (existing) {
      return {
        provider: existing.provider,
        // A cached review produced by the fallback keeps saying so on re-read.
        degraded: existing.provider === 'mock' && getAIProvider().name !== 'mock',
        headline: '',
        summary: existing.summary,
        checks: existing.checks ?? [],
        violations: (existing.checks ?? []).filter((c) => c.status !== 'PASS').length,
        blocking: (existing.checks ?? []).some((c) => c.status === 'FAIL'),
        riskLevel: existing.riskLevel as FullReview['riskLevel'],
        recommendation: existing.recommendation as FullReview['recommendation'],
        confidence: existing.confidence,
        reasoning: existing.reasoning ?? '',
        comparisons: existing.comparisons ?? [],
      };
    }
  }

  const ctx = await buildRequestContext(requestId);
  if (!ctx) return null;

  const provider = getAIProvider();
  const l = aiLocale(locale);
  let degraded = false;

  let summary: Awaited<ReturnType<typeof provider.summarizeRequest>>;
  let policy: Awaited<ReturnType<typeof provider.reviewPolicy>>;
  let risk: Awaited<ReturnType<typeof provider.detectRisk>>;

  try {
    summary = await provider.summarizeRequest(ctx, l);
    policy = await provider.reviewPolicy(ctx, l);
    risk = await provider.detectRisk(ctx, policy, l);
  } catch (err) {
    // Never let an AI failure block the approval screen from rendering.
    console.error('[ai] review generation failed', err);
    const { MockAIProvider } = await import('./mock-provider');
    const fallback = new MockAIProvider();
    summary = await fallback.summarizeRequest(ctx, l);
    policy = await fallback.reviewPolicy(ctx, l);
    risk = await fallback.detectRisk(ctx, policy, l);
    degraded = true;
  }

  // A provider that caught its own error and fell back internally reports it
  // here, so a silent downgrade still reaches the approver as a visible notice.
  degraded = degraded || Boolean(summary.degraded) || Boolean(risk.degraded);

  const review: FullReview = {
    ...summary,
    ...policy,
    ...risk,
    provider: degraded ? 'mock' : provider.name,
    degraded,
  };

  if (opts.force) await db.delete(aiReviews).where(and(eq(aiReviews.requestId, requestId), eq(aiReviews.locale, locale)));

  await db.insert(aiReviews).values({
    requestId,
    locale,
    provider: review.provider,
    summary: review.summary,
    recommendation: review.recommendation,
    confidence: review.confidence,
    riskLevel: review.riskLevel,
    reasoning: review.reasoning,
    checks: review.checks,
    comparisons: review.comparisons,
  });

  // Priority depends on risk, so recompute it now that the risk is known.
  const [req] = await db
    .select({
      amountBase: requests.amountBase,
      dueAt: requests.dueAt,
      requestType: requests.requestType,
      status: requests.status,
    })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);

  if (req && ['SUBMITTED', 'IN_REVIEW'].includes(req.status)) {
    const { score, priority } = scorePriority({
      amountBase: Number(req.amountBase),
      hoursToDue: req.dueAt ? (req.dueAt.getTime() - Date.now()) / 3_600_000 : null,
      riskLevel: review.riskLevel,
      hasBlockingViolation: review.blocking,
      requestType: req.requestType,
    });
    await db.update(requests).set({ priority, priorityScore: score }).where(eq(requests.id, requestId));
  }

  return review;
}

/**
 * Generates reviews for anything currently awaiting a decision that does not
 * have one.
 *
 * Without this the approval inbox shows "Not assessed" in the AI risk column
 * until somebody opens each request individually — which defeats the purpose of
 * having the column, since risk is exactly what should decide what you open first.
 *
 * Runs once per process after the database is ready, bounded and non-fatal.
 */
export async function backfillAiReviews(limit = 60, locale: Locale = 'en') {
  try {
    const db = await ready();
    const pending = await db
      .select({ id: requests.id })
      .from(requests)
      .where(
        sql`${requests.status} in ('SUBMITTED','IN_REVIEW')
            and not exists (select 1 from ai_reviews ar where ar.request_id = ${requests.id} and ar.locale = ${locale})`,
      )
      .limit(limit);

    if (pending.length === 0) return;
    console.log(`[ai] generating ${locale} reviews for ${pending.length} open request(s)`);
    for (const row of pending) {
      try {
        await getOrCreateReview(row.id, { locale });
      } catch (err) {
        console.error('[ai] backfill failed for', row.id, err);
      }
    }
  } catch (err) {
    console.error('[ai] backfill aborted', err);
  }
}

/** Called whenever a request's content or state changes. */
export async function invalidateAiReview(requestId: string) {
  const db = await ready();
  await db.delete(aiReviews).where(eq(aiReviews.requestId, requestId));
}

export async function recordReviewFeedback(requestId: string, helpful: boolean) {
  const db = await ready();
  const [latest] = await db
    .select({ id: aiReviews.id })
    .from(aiReviews)
    .where(eq(aiReviews.requestId, requestId))
    .orderBy(desc(aiReviews.createdAt))
    .limit(1);
  if (!latest) return;
  await db
    .update(aiReviews)
    .set(
      helpful
        ? { helpfulVotes: sql`${aiReviews.helpfulVotes} + 1` }
        : { unhelpfulVotes: sql`${aiReviews.unhelpfulVotes} + 1` },
    )
    .where(eq(aiReviews.id, latest.id));
}
