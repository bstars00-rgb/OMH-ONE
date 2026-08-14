import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { canActOnStep, canCancelRequest, hasRole } from '@/lib/rbac';
import { getRequestDetail } from '@/server/queries/requests';
import { getOrCreateReview } from '@/lib/ai/review';
import { isLiveModel } from '@/lib/ai';
import { PageHeader } from '@/components/page-header';
import { Avatar, Card, CardHeader, CardBody, DetailRow } from '@/components/ui/primitives';
import { PriorityBadge, StatusBadge, TypeBadge } from '@/components/ui/badges';
import { ForbiddenPage } from '@/components/ui/states';
import { RequestContent, AttachmentList } from '@/components/requests/detail/request-content';
import { ApprovalChain, ActivityLog } from '@/components/requests/detail/timeline';
import { CommentFeed } from '@/components/requests/detail/comment-feed';
import { DecisionBar } from '@/components/requests/detail/decision-bar';
import { AiReviewPanel } from '@/components/requests/detail/ai-panel';
import { formatMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/dates';
import { REQUEST_TYPE_META, type RequestType } from '@/types/domain';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getRequestDetail(session, id);
  if (!detail || detail === 'FORBIDDEN') return { title: 'Request' };
  return { title: `${detail.request.requestNumber} — ${detail.request.title}` };
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const detail = await getRequestDetail(session, id);
  if (detail === null) notFound();
  if (detail === 'FORBIDDEN') return <ForbiddenPage what="this request" />;

  const { request } = detail;
  const isRequester = request.requesterId === session.employeeId;
  const canDecide = canActOnStep(session, detail.currentStep) && ['SUBMITTED', 'IN_REVIEW'].includes(request.status);
  const canSubmit = isRequester && ['DRAFT', 'RETURNED'].includes(request.status);
  const canCancel = canCancelRequest(session, request);
  const canComment = !hasRole(session, 'AUDITOR');
  const isCurrentApprover = detail.currentStep?.approverId === session.employeeId;

  // Awaited here rather than streamed, because the decision controls depend on it:
  // the "approve with override" path must not be skipped just because the panel
  // had not finished loading.
  const review = await getOrCreateReview(request.id);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: isRequester ? 'My Requests' : 'Approvals', href: isRequester ? '/requests' : '/approvals' },
          { label: request.requestNumber },
        ]}
        title={request.title}
        meta={
          <>
            <TypeBadge type={request.requestType} />
            <StatusBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
            <span className="font-mono text-xs text-text-subtle">{request.requestNumber}</span>
          </>
        }
        actions={
          Number(request.amountBase) > 0 ? (
            <div className="text-right">
              <p className="text-[11px] text-text-muted">Total amount</p>
              <p className="text-xl font-semibold text-text tabular">
                {formatMoney(request.amountBase, request.currency)}
              </p>
            </div>
          ) : undefined
        }
      />

      {/* Decision controls sit above the fold — an approver should never scroll to act. */}
      <div className="mb-5">
        <DecisionBar
          requestId={request.id}
          canDecide={canDecide}
          canSubmit={canSubmit}
          canCancel={canCancel}
          hasBlockingIssue={review?.blocking ?? false}
          riskLevel={review?.riskLevel ?? 'LOW'}
          isCurrentApprover={isCurrentApprover}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        {/* LEFT — who, what, when */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Request information" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={detail.requester.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{detail.requester.name}</p>
                  <p className="truncate text-xs text-text-muted">{detail.requester.position ?? 'Employee'}</p>
                  <p className="truncate text-[11px] text-text-subtle">{detail.requester.email}</p>
                </div>
              </div>

              <dl className="divide-y divide-border-subtle border-t border-border-subtle pt-1">
                <DetailRow label="Type">{REQUEST_TYPE_META[request.requestType as RequestType]?.label}</DetailRow>
                <DetailRow label="Department">{detail.departmentName ?? '—'}</DetailRow>
                <DetailRow label="Cost centre">{detail.costCenter ?? '—'}</DetailRow>
                <DetailRow label="Reports to">{detail.requester.managerName ?? '—'}</DetailRow>
                <DetailRow label="Created">{formatDateTime(request.createdAt)}</DetailRow>
                <DetailRow label="Submitted">
                  {request.submittedAt ? formatDateTime(request.submittedAt) : 'Not submitted'}
                </DetailRow>
                {request.decidedAt && <DetailRow label="Decided">{formatDateTime(request.decidedAt)}</DetailRow>}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Attachments (${detail.attachments.length})`} />
            <CardBody>
              <AttachmentList items={detail.attachments} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Approval route" />
            <CardBody>
              <ApprovalChain detail={detail} />
            </CardBody>
          </Card>
        </div>

        {/* CENTER — the request itself */}
        <div className="min-w-0 space-y-4">
          {request.description && request.requestType !== 'BUSINESS_TRIP' && (
            <Card>
              <CardHeader title="Description" />
              <CardBody>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-text">{request.description}</p>
              </CardBody>
            </Card>
          )}

          <RequestContent detail={detail} />

          <Card>
            <CardHeader title="Activity" description="Every recorded action on this request, oldest first." />
            <CardBody>
              <ActivityLog detail={detail} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Comments (${detail.comments.length})`} />
            <CardBody>
              <CommentFeed
                requestId={request.id}
                comments={detail.comments.map((c) => ({
                  id: c.id,
                  body: c.body,
                  authorName: c.authorName,
                  authorType: c.authorType,
                  createdAt: c.createdAt,
                }))}
                canComment={canComment}
              />
            </CardBody>
          </Card>
        </div>

        {/* RIGHT — what the approver reads instead of the whole request */}
        <div className="min-w-0">
          <AiReviewPanel review={review} requestId={request.id} canDecide={canDecide} liveModel={isLiveModel()} />
        </div>
      </div>
    </>
  );
}
