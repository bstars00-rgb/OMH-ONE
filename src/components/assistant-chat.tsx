'use client';

import * as React from 'react';
import { AlertTriangle, ArrowRight, Loader2, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui/primitives';
import { askManagementAction, type ManagementResult } from '@/server/actions/assistant';
import { humanize } from '@/lib/utils';

const SUGGESTIONS = [
  'Give me this month’s management summary',
  'Why did travel expenses change last month?',
  'How much did SCM spend this quarter?',
  'Which approvals are delayed?',
  'Show requests over $5,000',
  'Which employee used the most annual leave?',
  'What is the budget position?',
  'Who are our top vendors?',
];

interface Turn {
  question: string;
  answer: ManagementResult;
}

export function AssistantChat({ liveModel, scope }: { liveModel: boolean; scope: string }) {
  const [question, setQuestion] = React.useState('');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [pending, setPending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, pending]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setQuestion('');
    const answer = await askManagementAction(trimmed);
    setTurns((t) => [...t, { question: trimmed, answer }]);
    setPending(false);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {turns.length === 0 && (
        <Card className="mb-4 border-accent-border bg-accent-soft/30">
          <CardBody className="space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <Sparkles className="size-4 text-accent" /> What can I ask?
            </p>
            <p className="text-xs leading-relaxed text-text-muted">
              I answer from the records you are permitted to see ({scope.toLowerCase()}). Every answer comes back as a
              summary, the evidence behind it, any risk, and a recommended action.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
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
          </CardBody>
        </Card>
      )}

      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <p className="flex justify-end">
              <span className="max-w-[85%] rounded-[var(--radius-card)] bg-accent px-3 py-2 text-[13px] text-accent-fg">
                {t.question}
              </span>
            </p>

            <Card>
              <CardBody className="space-y-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">Summary</p>
                  <p className="text-[13px] leading-relaxed text-text">{t.answer.summary}</p>
                </div>

                {t.answer.evidence.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">Evidence</p>
                    <ul className="space-y-0.5">
                      {t.answer.evidence.map((e, j) => (
                        <li key={j} className="text-xs text-text-muted tabular">
                          · {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {t.answer.risk && (
                  <div className="flex gap-2 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-900 dark:bg-amber-950/50">
                    <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
                        Risk
                      </p>
                      <p className="text-xs text-amber-900 dark:text-amber-200">{t.answer.risk}</p>
                    </div>
                  </div>
                )}

                {t.answer.action && (
                  <div className="flex gap-2 border-t border-border-subtle pt-2.5">
                    <ArrowRight className="mt-px size-3.5 shrink-0 text-text-subtle" />
                    <div>
                      <p className="text-[10px] font-semibold tracking-wider text-text-subtle uppercase">
                        Recommended action
                      </p>
                      <p className="text-xs text-text">{t.answer.action}</p>
                    </div>
                  </div>
                )}

                <p className="flex items-center gap-1.5 border-t border-border-subtle pt-2 text-[10px] text-text-subtle">
                  <ShieldCheck className="size-3" />
                  Answered by query <code className="font-mono">{humanize(t.answer.intent)}</code> against your visible
                  records. The model selects a query from a fixed set — it never writes SQL and never sees data outside
                  your permissions.
                </p>
              </CardBody>
            </Card>
          </div>
        ))}

        {pending && (
          <Card>
            <CardBody className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="size-4 animate-spin" /> Querying your records…
            </CardBody>
          </Card>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-0 mt-4 flex gap-2 bg-canvas py-3"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about spend, travel, leave, budgets, vendors or approvals…"
          aria-label="Ask a question about company data"
          disabled={pending}
          className="h-10"
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending || !question.trim()}>
          <Send /> Ask
        </Button>
      </form>

      {!liveModel && (
        <p className="pb-4 text-center text-[11px] text-text-subtle">
          Running the built-in query engine — no external service is called. Set <code>AI_PROVIDER=anthropic</code> with
          an API key for model-written prose over the same figures.
        </p>
      )}
    </div>
  );
}
