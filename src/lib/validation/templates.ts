import { z } from 'zod';

/**
 * Form template validation.
 *
 * A template is authored by an administrator — often with AI drafting it — and
 * then rendered as a real form that produces real approvals. So the shape is
 * checked at every write rather than trusted: a template with a duplicate field
 * key, a select with no options, or a title pattern referencing a field that
 * does not exist would each fail at render time, in front of a user, on a form
 * they are trying to file.
 *
 * Messages are i18n keys; the action resolves them (see DECISIONS §14).
 */

export const FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'date', 'select', 'checkbox', 'employee'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const TEMPLATE_CATEGORIES = ['HR', 'FINANCE', 'TRAVEL', 'DOCUMENT', 'GENERAL'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Field keys become object keys and title placeholders, so they stay identifier-shaped. */
const fieldKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'tpl.badFieldKey')
  .max(40);

const optionSchema = z.object({
  value: z.string().trim().min(1).max(60),
  labelEn: z.string().trim().min(1).max(80),
  labelKo: z.string().trim().min(1).max(80),
});

export const templateFieldSchema = z
  .object({
    key: fieldKey,
    labelEn: z.string().trim().min(1, 'tpl.needLabel').max(80),
    labelKo: z.string().trim().min(1, 'tpl.needLabel').max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(optionSchema).max(30).optional(),
    hintEn: z.string().trim().max(200).optional(),
    hintKo: z.string().trim().max(200).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) > 0, {
    message: 'tpl.selectNeedsOptions',
    path: ['options'],
  });

export type TemplateField = z.infer<typeof templateFieldSchema>;

export const templateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9-]*$/, 'tpl.badCode')
      .max(40),
    nameEn: z.string().trim().min(2, 'tpl.needName').max(120),
    nameKo: z.string().trim().min(1, 'tpl.needName').max(120),
    descriptionEn: z.string().trim().max(300).optional(),
    descriptionKo: z.string().trim().max(300).optional(),
    officeId: z.string().uuid().nullable().optional(),
    category: z.enum(TEMPLATE_CATEGORIES).default('GENERAL'),
    icon: z.string().trim().max(40).default('FileText'),
    fields: z.array(templateFieldSchema).min(1, 'tpl.needField').max(25),
    titlePattern: z.string().trim().max(200).default(''),
    amountField: z.string().trim().max(40).nullable().optional(),
    workflowId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
  })
  .superRefine((tpl, ctx) => {
    // Duplicate keys would silently overwrite each other in the values object.
    const seen = new Set<string>();
    tpl.fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: 'custom', message: 'tpl.duplicateKey', path: ['fields', i, 'key'] });
      }
      seen.add(f.key);
    });

    // A placeholder with no field renders as a literal "{city}" in the title.
    for (const name of placeholdersIn(tpl.titlePattern)) {
      if (!seen.has(name)) {
        ctx.addIssue({ code: 'custom', message: 'tpl.unknownPlaceholder', path: ['titlePattern'] });
      }
    }

    if (tpl.amountField) {
      const field = tpl.fields.find((f) => f.key === tpl.amountField);
      if (!field) {
        ctx.addIssue({ code: 'custom', message: 'tpl.unknownAmountField', path: ['amountField'] });
      } else if (field.type !== 'money' && field.type !== 'number') {
        // The value feeds budget commitment and amount-based routing, so it has
        // to be numeric or the request would route as if it were free.
        ctx.addIssue({ code: 'custom', message: 'tpl.amountFieldNotNumeric', path: ['amountField'] });
      }
    }
  });

export type TemplateInput = z.infer<typeof templateSchema>;

export function placeholdersIn(pattern: string): string[] {
  return [...pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/**
 * Builds the request title from the submitted values.
 *
 * Falls back to the template name when the pattern is empty or every
 * placeholder resolved to nothing — a request with a blank title is worse than
 * a generic one.
 */
export function buildTitle(pattern: string, templateName: string, values: Record<string, unknown>): string {
  if (!pattern.trim()) return templateName;
  const filled = pattern
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = values[key];
      return v === undefined || v === null || v === '' ? '' : String(v);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return filled || templateName;
}

/**
 * Validates submitted values against a template's own fields.
 *
 * Built per template rather than declared once, because the shape is only known
 * at runtime. Returns the same `{ fieldKey: messageKey }` map the typed forms
 * produce, so the renderer treats both paths identically.
 */
export function validateValues(
  fields: TemplateField[],
  raw: Record<string, unknown>,
): { ok: true; values: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const input = raw[field.key];
    const empty = input === undefined || input === null || String(input).trim() === '';

    if (empty) {
      if (field.required && field.type !== 'checkbox') errors[field.key] = 'valid.required';
      values[field.key] = field.type === 'checkbox' ? Boolean(input) : '';
      continue;
    }

    switch (field.type) {
      case 'number':
      case 'money': {
        const n = Number(input);
        if (!Number.isFinite(n)) errors[field.key] = 'valid.badAmount';
        else if (n < 0) errors[field.key] = 'valid.minZero';
        else values[field.key] = n;
        break;
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input))) errors[field.key] = 'valid.badDate';
        else values[field.key] = String(input);
        break;
      }
      case 'select': {
        const allowed = (field.options ?? []).map((o) => o.value);
        if (!allowed.includes(String(input))) errors[field.key] = 'valid.checkField';
        else values[field.key] = String(input);
        break;
      }
      case 'checkbox': {
        values[field.key] = Boolean(input);
        break;
      }
      case 'employee': {
        if (!/^[0-9a-f-]{36}$/i.test(String(input))) errors[field.key] = 'valid.checkField';
        else values[field.key] = String(input);
        break;
      }
      default: {
        const text = String(input).trim();
        if (text.length > 4000) errors[field.key] = 'valid.tooLong4000';
        else values[field.key] = text;
      }
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
