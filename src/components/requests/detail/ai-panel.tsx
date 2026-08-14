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
import { useT } from '@/lib/i18n/client';
import type { AiCheck, AiComparison, FullReview } from '@/lib/ai/types';

/** Suggestion chips are message keys, so they are asked in the reader's language. */
const SUGGESTED = [
  'ai.suggest.expensive',
  'ai.suggest.policy',
  'ai.suggest.budget',
  'ai.suggest.compare',
  'ai.suggest.whoElse',
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
  const t = useT();

  if (!review) {
    return (
      <Card>
        <CardBody className="text-center">
          <Sparkles className="mx-auto mb-2 size-5 text-text-subtle" />
          <p className="text-sm font-medium text-text">{t('ai.unavailableTitle')}</p>
          <p className="mt-1 text-xs text-text-muted">{t('ai.unavailableBody')}</p>
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
            {t('ai.review')}
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
              {t('ai.degraded')}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Checks */}
      <Card>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text">{t('ai.checks')}</span>
          <span className="flex gap-1">
            {failing.length > 0 && <Badge tone="rose">{t('ai.failedCount', { count: failing.length })}</Badge>}
            {warning.length > 0 && <Badge tone="amber">{t('ai.warningCount', { count: warning.length })}</Badge>}
            {failing.length === 0 && warning.length === 0 && <Badge tone="emerald">{t('ai.allClear')}</Badge>}
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
            <span className="text-[13px] font-semibold text-text">{t('ai.comparison')}</span>
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
  const t = useT();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      size="iconSm"
      variant="ghost"
      aria-label={t('ai.regenerate')}
      title={t('ai.regenerate')}
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
  const t = useT();
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
          {/* Status is never colour alone — it is announced to screen readers too. */}
          <span className="sr-only"> — {t(`severity.${check.status}`)}</span>
        </p>
        {check.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{check.detail}</p>}
      </div>
    </li>
  );
}

function Recommendation({ review, requestId, liveModel }: { review: FullReview; requestId: string; liveModel: boolean }) {
  const t = useT();
  const [showWhy, setShowWhy] = React.useState(false);
  const [voted, setVoted] = React.useState<'up' | 'down' | null>(null);
  const [, startTransition] = React.useTransition();

  const tone = review.recommendation === 'APPROVE' ? 'emerald' : review.recommendation === 'REJECT' ? 'rose' : 'amber';
  const label =
    review.recommendation === 'APPROVE'
      ? t('ai.recommendApprove')
      : review.recommendation === 'REJECT'
        ? t('ai.recommendReject')
        : t('ai.recommendReview');

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
            <span className="text-[11px] text-text-muted">{t('ai.confidence')}</span>
            <span className="text-sm font-semibold text-text tabular">{review.confidence}%</span>
          </div>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-accent" style={{ width: `${review.confidence}%` }} />
        </div>

        <p className="rounded border border-border-subtle bg-surface-sunken px-2.5 py-2 text-[11px] leading-relaxed text-text-muted">
          {t('ai.notDecision')}
        </p>

        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="flex w-full items-center justify-between gap-2 text-xs font-medium text-accent hover:underline"
        >
          <span className="flex items-center gap-1.5">
            <CircleHelp className="size-3.5" /> {t('ai.why')}
          </span>
          <ChevronDown className={cn('size-3.5 transition-transform', showWhy && 'rotate-180')} />
        </button>

        {showWhy && (
          <div className="space-y-2 rounded border border-border-subtle bg-surface-sunken p-2.5">
            <p className="text-[11px] leading-relaxed text-text">{review.reasoning}</p>
            <p className="text-[10px] text-text-subtle">
              {t('ai.assessedBy', {
                provider: review.provider === 'mock' ? t('ai.providerRules') : t('ai.providerModel'),
              })}
              {!liveModel && t('ai.noExternal')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border-subtle pt-2.5">
          <span className="text-[11px] text-text-muted">{t('ai.useful')}</span>
          <Button
            size="iconSm"
            variant={voted === 'up' ? 'success' : 'ghost'}
            aria-label={t('ai.helpful')}
            aria-pressed={voted === 'up'}
            disabled={voted !== null}
            onClick={() => vote('up')}
          >
            <ThumbsUp />
          </Button>
          <Button
            size="iconSm"
            variant={voted === 'down' ? 'danger' : 'ghost'}
            aria-label={t('ai.notHelpful')}
            aria-pressed={voted === 'down'}
            disabled={voted !== null}
            onClick={() => vote('down')}
          >
            <ThumbsDown />
          </Button>
          {voted && <span className="text-[11px] text-text-subtle">{t('ai.thanks')}</span>}
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
  const t = useT();
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
      setTurns((prev) => [...prev, { question: trimmed, answer: result.answer, evidence: result.evidence }]);
    } else {
      // The action returns a message key, not prose, so it renders in this locale.
      setError(t(result.message));
    }
    setPending(false);
  }

  return (
    <Card>
      <div className="border-b border-border-subtle px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
          <Sparkles className="size-4 text-accent" /> {t('ai.askAbout')}
        </span>
      </div>

      <CardBody className="space-y-3 p-4">
        {turns.length === 0 && !pending && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => ask(t(key))}
                className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent"
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-xs font-medium text-text">{turn.question}</p>
            <p className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2.5 py-2 text-xs leading-relaxed text-text">
              {turn.answer}
            </p>
            {turn.evidence.length > 0 && (
              <ul className="space-y-0.5 pl-1">
                {turn.evidence.map((e, j) => (
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
            <Loader2 className="size-3.5 animate-spin" /> {t('state.thinking')}
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
            placeholder={t('ai.askPlaceholder')}
            aria-label={t('ai.askAria')}
            className="h-8"
            disabled={pending}
          />
          <Button type="submit" size="icon" variant="primary" aria-label={t('ai.send')} disabled={pending || !question.trim()}>
            <Send />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
