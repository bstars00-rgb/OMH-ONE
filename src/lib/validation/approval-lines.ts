import { z } from 'zod';
import { REQUEST_TYPES } from '@/types/domain';

/**
 * Approval line presets.
 *
 * A line is a saved list of people in order — what the requester picks instead
 * of assembling the same five approvers every week. It is not the workflow: the
 * workflow derives a route from the request's facts, a line names the people.
 *
 * Two scopes share one table. A personal line belongs to its owner and only
 * they see it; an organization line has no owner and is offered to everyone in
 * its office. Publishing one is an administrative act, which is why the service
 * checks a capability for it and ownership for the other.
 */
export const approvalLineSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'line.needName').max(80, 'line.needName'),
  /** Ordered approvers. Order is the approval order. */
  approverIds: z.array(z.string().uuid()).min(1, 'line.needApprover').max(10, 'line.tooManyApprovers'),
  /** Null suits any request type. */
  requestType: z.enum(REQUEST_TYPES).nullable().optional(),
  /** Null means every office; otherwise the line is offered in that office only. */
  officeId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
});

export type ApprovalLineInput = z.infer<typeof approvalLineSchema>;
