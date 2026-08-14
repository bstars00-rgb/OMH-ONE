'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardBody, Input } from '@/components/ui/primitives';
import { RiskBadge } from '@/components/ui/badges';
import { askCopilotAction, regenerateReviewAction, reviewFeedbackAction } from '@/server/actions/ai';
import { cn } from '@/lib/utils';
import type { AiCheck, AiComparison, FullReview } from '@/lib/ai/types';

const SUGGESTED = [
  'Why is this expensive?',
  'Does this breach any policy?',
  'How much budget remains?',
  'Compare with previous requests',
  'Who else is away on these dates?',
];

/**
 * The panel an approver reads instead of the whole request.
 *
 * Structure is deliberate: summary → what was checked → how it compares →
 * recommendation. The recommendation is last and is always labelled as a
 * recommendation, because the decision is the human's.
 */
export function AiReviewPanel({
  review,
  requestId,
  canDecide,
  liveModel,
}: {
  review: FullReview | null;
  requestId: string;
  canDecide: boolean;
  liveModel: boolean;
}) {
  if (!review) {
    return (
      <Card>
        <CardBody className="text-center">
          <Sparkles className="mx-auto mb-2 size-5 text-text-subtle" />
          <p className="text-sm font-medium text-text">AI review not available</p>
          <p className="mt-1 text-xs text-text-muted">
            Analysis could not be generated for this request. Approvals are unaffected — you can still decide using the
            request detail.
          </p>
        </CardBody>
      </Card>
    );
  }

  const failing = review.checks.filter((c) => c.status === 'FAIL');
  const warning = review.checks.filter((c) => c.status === 'WARN');
  const passing = review.checks.filter((c) => c.status === 'PASS');

  return (
    <div className="space-y-3">
      <Card className="border-accent-border bg-accent-soft/40">
        <div className="flex items-center justify-between gap-2 border-b border-accent-border/60 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
            <Sparkles className="size-4 text-accent" />
            AI review
          </span>
          <span className="flex items-center gap-1">
            <RiskBadge risk={review.riskLevel} />
            <RefreshButton requestId={requestId} />
          </span>
        </div>

        <CardBody className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-text">{review.summary}</p>

          {review.degraded && (
            <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              The model was unreachable — this analysis was produced by the built-in rules engine.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Checks */}
      <Card>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text">Checks</span>
          <span className="flex gap-1">
            {failing.length > 0 && <Badge tone="rose">{failing.length} failed</Badge>}
            {warning.length > 0 && <Badge tone="amber">{warning.length} warning</Badge>}
            {failing.length === 0 && warning.length === 0 && <Badge tone="emerald">All clear</Badge>}
          </span>
        </div>
        <ul className="divide-y divide-border-subtle">
          {[...failing, ...warning, ...passing].map((c, i) => (
            <CheckRow key={`${c.label}-${i}`} check={c} />
          ))}
        </ul>
      </Card>

      {/* Comparisons */}
      {review.comparisons.length > 0 && (
        <Card>
          <div className="border-b border-border-subtle px-4 py-2.5">
            <span className="text-[13px] font-semibold text-text">How it compares</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {review.comparisons.map((c: AiComparison, i) => (
              <li key={`${c.label}-${i}`} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="text-xs text-text-muted">{c.label}</span>
                <span className="flex items-baseline gap-1.5 text-xs font-medium text-text tabular">
                  {c.value}
                  {c.deltaPct !== undefined && (
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        c.deltaPct > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {c.deltaPct > 0 ? '+' : ''}
                      {c.deltaPct}%
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Recommendation review={review} requestId={requestId} liveModel={liveModel} />

      {canDecide && <Copilot requestId={requestId} />}
    </div>
  );
}

/**
 * The review is cached so an approver sees a stable assessment across visits.
 * That means it can go stale after the underlying data moves (a budget is spent,
 * a duplicate claim is withdrawn) — so there has to be a way to re-run it.
 */
function RefreshButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      size="iconSm"
      variant="ghost"
      aria-label="Re-run this analysis against current data"
      title="Re-run this analysis against current data"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await regenerateReviewAction(requestId);
        setPending(false);
        router.refresh();
      }}
    >
      <RefreshCw className={cn(pending && 'animate-spin')} />
    </Button>
  );
}

function CheckRow({ check }: { check: AiCheck }) {
  const icon =
    check.status === 'PASS' ? (
      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
    ) : check.status === 'WARN' ? (
      <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
    ) : (
      <XCircle className="size-3.5 text-rose-600 dark:text-rose-400" />
    );

  return (
    <li className="flex gap-2 px-4 py-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">
          {check.label}
          <span className="sr-only"> — {check.status === 'PASS' ? 'passed' : check.status === 'WARN' ? 'warning' : 'failed'}</span>
        </p>
        {check.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{check.detail}</p>}
      </div>
    </li>
  );
}

function Recommendation({ review, requestId, liveModel }: { review: FullReview; requestId: string; liveModel: boolean }) {
  const [showWhy, setShowWhy] = React.useState(false);
  const [voted, setVoted] = React.useState<'up' | 'down' | null>(null);
  const [, startTransition] = React.useTransition();

  const tone =
    review.recommendation === 'APPROVE' ? 'emerald' : review.recommendation === 'REJECT' ? 'rose' : 'amber';
  const label =
    review.recommendation === 'APPROVE'
      ? 'Recommend approval'
      : review.recommendation === 'REJECT'
        ? 'Recommend rejection'
        : 'Needs your review';

  function vote(kind: 'up' | 'down') {
    setVoted(kind);
    startTransition(() => reviewFeedbackAction(requestId, kind === 'up'));
  }

  return (
    <Card>
      <CardBody className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={tone} className="px-2 py-1 text-xs">
            {label}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted">Confidence</span>
            <span className="text-sm font-semibold text-text tabular">{review.confidence}%</span>
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-accent" style={{ width: `${review.confidence}%` }} />
        </div>

        <p className="rounded border border-border-subtle bg-surface-sunken px-2.5 py-2 text-[11px] leading-relaxed text-text-muted">
          <strong className="font-semibold text-text">This is a recommendation, not a decision.</strong> A person must
          approve or reject. Nothing here changes the request on its own.
        </p>

        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="flex w-full items-center justify-between gap-2 text-xs font-medium text-accent hover:underline"
        >
          <span className="flex items-center gap-1.5">
            <CircleHelp className="size-3.5" /> Why this recommendation?
          </span>
          <ChevronDown className={cn('size-3.5 transition-transform', showWhy && 'rotate-180')} />
        </button>

        {showWhy && (
          <div className="space-y-2 rounded border border-border-subtle bg-surface-sunken p-2.5">
            <p className="text-[11px] leading-relaxed text-text">{review.reasoning}</p>
            <p className="text-[10px] text-text-subtle">
              Assessed by the {review.provider === 'mock' ? 'built-in rules engine' : 'configured model'} from this
              request&apos;s own figures: policy thresholds, department budget, historical comparisons and duplicate
              checks.
              {!liveModel && ' No external service was called.'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border-subtle pt-2.5">
          <span className="text-[11px] text-text-muted">Was this useful?</span>
          <Button
            size="iconSm"
            variant={voted === 'up' ? 'success' : 'ghost'}
            aria-label="This review was helpful"
            aria-pressed={voted === 'up'}
            disabled={voted !== null}
            onClick={() => vote('up')}
          >
            <ThumbsUp />
          </Button>
          <Button
            size="iconSm"
            variant={voted === 'down' ? 'danger' : 'ghost'}
            aria-label="This review was not helpful"
            aria-pressed={voted === 'down'}
            disabled={voted !== null}
            onClick={() => vote('down')}
          >
            <ThumbsDown />
          </Button>
          {voted && <span className="text-[11px] text-text-subtle">Thanks — recorded.</span>}
        </div>
      </CardBody>
    </Card>
  );
}

interface Turn {
  question: string;
  answer: string;
  evidence: string[];
}

function Copilot({ requestId }: { requestId: string }) {
  const [question, setQuestion] = React.useState('');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    setQuestion('');
    const result = await askCopilotAction(requestId, trimmed);
    if (result.ok) {
      setTurns((t) => [...t, { question: trimmed, answer: result.answer, evidence: result.evidence }]);
    } else {
      setError(result.message);
    }
    setPending(false);
  }

  return (
    <Card>
      <div className="border-b border-border-subtle px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
          <Sparkles className="size-4 text-accent" /> Ask about this request
        </span>
      </div>

      <CardBody className="space-y-3 p-4">
        {turns.length === 0 && !pending && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-xs font-medium text-text">{t.question}</p>
            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2.5 py-2 text-xs leading-relaxed text-text">
              {t.answer}
            </p>
            {t.evidence.length > 0 && (
              <ul className="space-y-0.5 pl-1">
                {t.evidence.map((e, j) => (
                  <li key={j} className="text-[11px] text-text-subtle">
                    · {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {pending && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="size-3.5 animate-spin" /> Checking the data…
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex gap-1.5"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Ask a question about this request"
            className="h-8"
            disabled={pending}
          />
          <Button type="submit" size="icon" variant="primary" aria-label="Send question" disabled={pending || !question.trim()}>
            <Send />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
