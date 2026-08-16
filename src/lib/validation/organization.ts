import { z } from 'zod';

/**
 * Organization validation.
 *
 * Codes are load-bearing, not labels. `materializeSteps` resolves the HR,
 * Finance and CEO approvers by looking up `departments.code` and taking that
 * department's head (see server/services/approval.ts). So a code is fixed once
 * created — renaming one would silently reroute every future approval — and the
 * three routing codes cannot be deleted at all.
 *
 * Messages are i18n keys; the action resolves them in the caller's language.
 */

const codeField = z
  .string()
  .trim()
  .min(2, 'org.badCode')
  .max(20, 'org.badCode')
  .regex(/^[A-Z][A-Z0-9-]*$/, 'org.badCode');

const nameField = z.string().trim().min(2, 'org.needName').max(120, 'org.needName');

/** Department codes the approval engine resolves approvers from. */
export const ROUTING_DEPT_CODES = ['HR', 'FIN', 'CEO'] as const;

export const officeSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: codeField,
  name: nameField,
  country: z.string().trim().min(2, 'org.needCountry').max(60),
  city: z.string().trim().min(2, 'org.needCity').max(60),
  timezone: z.string().trim().min(3, 'org.needTimezone').max(60),
  baseCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'org.badCurrency'),
});

export const departmentSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: codeField,
  name: nameField,
  officeId: z.string().uuid('org.needOffice'),
  headEmployeeId: z.string().uuid().nullable().optional(),
});

export const teamSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: codeField,
  name: nameField,
  departmentId: z.string().uuid('org.needDepartment'),
});

export const costCenterSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: codeField,
  name: nameField,
  departmentId: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

export type OfficeInput = z.infer<typeof officeSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type CostCenterInput = z.infer<typeof costCenterSchema>;
