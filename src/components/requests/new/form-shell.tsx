'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Save, Send, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Textarea } from '@/components/ui/primitives';
import { draftFromTextAction, type CreateResult } from '@/server/actions/create';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { RequestType } from '@/types/domain';

/* ------------------------------------------------------------------ */
/* AI draft box — shared by every form                                 */
/* ------------------------------------------------------------------ */

export function AiDraftBox({
  type,
  onDraft,
}: {
  type: RequestType;
  onDraft: (fields: Record<string, unknown>) => void;
}) {
  const t = useT();
  // Examples are per-type and per-language: the Korean sample has to parse under
  // the Korean date patterns the extractor understands.
  const example = t(`draft.example.${type}`);

  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{
    ok: boolean;
    message: string;
    missing?: string[];
    notes?: string[];
    confidence?: number;
  } | null>(null);

  async function generate() {
    if (!text.trim() || pending) return;
    setPending(true);
    setResult(null);
    const res = await draftFromTextAction(type, text);
    setPending(false);
    setResult(res);
    if (res.ok && res.fields) onDraft(res.fields);
  }

  return (
    <Card className="border-accent-border bg-accent-soft/30">
      <CardHeader
        title={t('draft.title')}
        description={t('draft.subtitle')}
        icon={<Sparkles className="size-4 text-accent" />}
      />
      <CardBody className="space-y-2.5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1500}
          placeholder={example || t('draft.placeholder')}
          aria-label={t('draft.aria')}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={generate} disabled={pending || text.trim().length < 10}>
            {pending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {pending ? t('state.reading') : t('draft.fill')}
          </Button>
          {example && !text && (
            <button type="button" onClick={() => setText(example)} className="text-[11px] text-accent hover:underline">
              {t('draft.useExample')}
            </button>
          )}
        </div>

        {result && (
          <div
            role="status"
            className={cn(
              'space-y-1 rounded-[var(--radius-control)] border px-2.5 py-2 text-[11px]',
              result.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
            )}
          >
            <p className="font-medium">{result.message}</p>
            {result.confidence !== undefined && result.ok && (
              <p>{t('draft.confidence', { pct: result.confidence })}</p>
            )}
            {result.notes?.map((n) => <p key={n}>{n}</p>)}
            {result.missing && result.missing.length > 0 && (
              <p className="font-medium">{t('draft.missing', { fields: result.missing.join(', ') })}</p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Form shell — submit bar, result banner, navigation                  */
/* ------------------------------------------------------------------ */

export function FormActions({
  onSave,
  onSubmit,
  pending,
  result,
  disabled,
}: {
  onSave: () => void;
  onSubmit: () => void;
  pending: 'save' | 'submit' | null;
  result: CreateResult | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const t = useT();

  React.useEffect(() => {
    if (result?.ok && result.requestId) {
      const t = setTimeout(() => router.push(`/requests/${result.requestId}`), 700);
      return () => clearTimeout(t);
    }
  }, [result, router]);

  return (
    <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border-subtle bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {result && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'mb-2.5 flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium',
            result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
          )}
        >
          {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          {result.message}
          {result.ok && <span className="text-text-muted">{t('state.opening')}</span>}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onSave} disabled={pending !== null || disabled}>
          {pending === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
          {t('action.saveDraft')}
        </Button>
        <Button variant="primary" onClick={onSubmit} disabled={pending !== null || disabled}>
          {pending === 'submit' ? <Loader2 className="animate-spin" /> : <Send />}
          {t('action.submit')}
        </Button>
      </div>
    </div>
  );
}

/** Inline field error, wired to the input via aria-describedby by the caller. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

export function useCreateForm() {
  const [pending, setPending] = React.useState<'save' | 'submit' | null>(null);
  const [result, setResult] = React.useState<CreateResult | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function run(action: (submitNow: boolean) => Promise<CreateResult>, submitNow: boolean) {
    setPending(submitNow ? 'submit' : 'save');
    setResult(null);
    setErrors({});
    const res = await action(submitNow);
    setPending(null);
    setResult(res);
    if (res.errors) setErrors(res.errors);
    // Bring the first error into view — long forms otherwise hide the problem.
    if (!res.ok && res.errors) {
      requestAnimationFrame(() => {
        document.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  return { pending, result, errors, run };
}
