'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { Avatar, Button, Textarea } from '@/components/ui/primitives';
import { addCommentAction } from '@/server/actions/requests';
import { useI18n } from '@/lib/i18n/client';
import { formatDateTimeL } from '@/lib/i18n/format';

export interface FeedComment {
  id: string;
  body: string;
  authorName: string | null;
  authorType: string;
  createdAt: Date | string;
}

export function CommentFeed({
  requestId,
  comments,
  canComment,
}: {
  requestId: string;
  comments: FeedComment[];
  canComment: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [body, setBody] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    setError(null);
    const res = await addCommentAction(requestId, body);
    setPending(false);
    if (res.ok) {
      setBody('');
      router.refresh();
    } else {
      setError(res.message);
    }
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-text-subtle">
          <MessageSquare className="size-3.5" />
          {t('detail.comments.empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName ?? t('audit.system')} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs font-medium text-text">{c.authorName ?? t('audit.system')}</span>
                  {c.authorType === 'AI' && (
                    <span className="rounded bg-accent-soft px-1 text-[10px] font-medium text-accent">AI</span>
                  )}
                  <span className="text-[11px] text-text-subtle tabular">{formatDateTimeL(locale, c.createdAt)}</span>
                </p>
                <p className="mt-1 rounded-[var(--radius-control)] border border-border-subtle bg-surface-sunken px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap text-text">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="new-comment" className="sr-only">
            {t('detail.comments.add')}
          </label>
          <Textarea
            id="new-comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder={t('detail.comments.placeholder')}
            disabled={pending}
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-subtle tabular">{body.length}/4000</span>
            <Button type="submit" size="sm" variant="primary" disabled={pending || !body.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              {t('action.comment')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
