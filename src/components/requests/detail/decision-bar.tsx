'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Ban, Check, Loader2, Send, Undo2, X } from 'lucide-react';
import { Button, Textarea } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/overlays';
import {
  approveRequestAction,
  cancelRequestAction,
  rejectRequestAction,
  returnRequestAction,
  submitRequestAction,
  markInReviewAction,
} from '@/server/actions/requests';
import { cn } from '@/lib/utils';

type Kind = 'approve' | 'reject' | 'return' | 'cancel';

/**
 * Decision controls.
 *
 * Approve is one click for low risk and gains a confirmation step when the AI
 * found a blocking issue — an approver should not be able to wave through a
 * budget breach without seeing it. Reject and Return always require a reason,
 * enforced on the server too.
 */
export function DecisionBar({
  requestId,
  canDecide,
  canSubmit,
  canCancel,
  hasBlockingIssue,
  riskLevel,
  isCurrentApprover,
}: {
  requestId: string;
  canDecide: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  hasBlockingIssue: boolean;
  riskLevel: string;
  isCurrentApprover: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Kind | 'submit' | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  // Opening a request you must decide moves it to "In review" — the requester
  // can then see that somebody is actually looking at it.
  React.useEffect(() => {
    if (isCurrentApprover) void markInReviewAction(requestId);
  }, [isCurrentApprover, requestId]);

  async function run(kind: Kind | 'submit', comment?: string) {
    setPending(kind);
    setResult(null);
    const res =
      kind === 'approve'
        ? await approveRequestAction(requestId, comment)
        : kind === 'reject'
          ? await rejectRequestAction(requestId, comment ?? '')
          : kind === 'return'
            ? await returnRequestAction(requestId, comment ?? '')
            : kind === 'cancel'
              ? await cancelRequestAction(requestId, comment)
              : await submitRequestAction(requestId);
    setPending(null);
    setResult(res);
    if (res.ok) router.refresh();
  }

  if (!canDecide && !canSubmit && !canCancel) {
    return result ? <Feedback result={result} /> : null;
  }

  return (
    <div className="space-y-2">
      {result && <Feedback result={result} />}

      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <Button variant="primary" onClick={() => run('submit')} disabled={pending !== null}>
            {pending === 'submit' ? <Loader2 className="animate-spin" /> : <Send />}
            Submit for approval
          </Button>
        )}

        {canDecide && (
          <>
            {hasBlockingIssue ? (
              <ReasonDialog
                kind="approve"
                title="Approve despite a blocking issue?"
                description="The AI review found an issue that normally blocks approval. Record why you are approving anyway — this is stored in the audit log."
                confirmLabel="Approve anyway"
                confirmVariant="warning"
                required
                pending={pending === 'approve'}
                onConfirm={(c) => run('approve', c)}
                trigger={
                  <Button variant="success" disabled={pending !== null}>
                    <AlertTriangle /> Approve with override
                  </Button>
                }
              />
            ) : (
              <Button variant="success" onClick={() => run('approve')} disabled={pending !== null}>
                {pending === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
                Approve
              </Button>
            )}

            <ReasonDialog
              kind="return"
              title="Return for correction"
              description="The requester can edit and resubmit. Tell them what needs to change."
              confirmLabel="Return request"
              confirmVariant="warning"
              required
              pending={pending === 'return'}
              onConfirm={(c) => run('return', c)}
              trigger={
                <Button variant="secondary" disabled={pending !== null}>
                  <Undo2 /> Return
                </Button>
              }
            />

            <ReasonDialog
              kind="reject"
              title="Reject this request"
              description="This closes the request permanently. The requester is notified with your reason."
              confirmLabel="Reject request"
              confirmVariant="danger"
              required
              pending={pending === 'reject'}
              onConfirm={(c) => run('reject', c)}
              trigger={
                <Button variant="secondary" disabled={pending !== null}>
                  <X /> Reject
                </Button>
              }
            />
          </>
        )}

        {canCancel && (
          <ReasonDialog
            kind="cancel"
            title="Withdraw this request"
            description="This stops the approval process. Approvers are told no action is needed."
            confirmLabel="Withdraw request"
            confirmVariant="danger"
            pending={pending === 'cancel'}
            onConfirm={(c) => run('cancel', c)}
            trigger={
              <Button variant="ghost" disabled={pending !== null}>
                <Ban /> Withdraw
              </Button>
            }
          />
        )}
      </div>

      {canDecide && riskLevel === 'LOW' && !hasBlockingIssue && (
        <p className="text-[11px] text-text-subtle">
          Low risk — no policy, budget or duplicate concerns were found. One click approves.
        </p>
      )}
    </div>
  );
}

function Feedback({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium',
        result.ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
      )}
    >
      {result.message}
    </p>
  );
}

function ReasonDialog({
  title,
  description,
  confirmLabel,
  confirmVariant,
  required,
  pending,
  onConfirm,
  trigger,
}: {
  kind: Kind;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
  required?: boolean;
  pending: boolean;
  onConfirm: (comment: string) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const invalid = required && !comment.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
              disabled={pending || invalid}
              onClick={() => {
                setTouched(true);
                if (invalid) return;
                onConfirm(comment);
                setOpen(false);
                setComment('');
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-text-muted">
            {required ? 'Reason (required)' : 'Reason (optional)'}
          </span>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            autoFocus
            aria-invalid={touched && invalid ? true : undefined}
            aria-describedby={touched && invalid ? 'reason-error' : undefined}
            placeholder="This is recorded on the request and sent to the requester."
          />
          {touched && invalid && (
            <span id="reason-error" role="alert" className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">
              A reason is required.
            </span>
          )}
        </label>
      </DialogContent>
    </Dialog>
  );
}
