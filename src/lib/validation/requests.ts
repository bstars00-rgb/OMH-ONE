import { z } from 'zod';
import { CURRENCIES, EXPENSE_CATEGORIES, LEAVE_TYPES, PURCHASE_CATEGORIES, TRIP_COST_CATEGORIES } from '@/types/domain';

/**
 * One schema per request type, used by both the client form and the server
 * action. The server never trusts the client's validation — `parse` runs again
 * inside the action, because a server function is reachable by direct POST.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
const money = z.coerce.number().finite().min(0, 'Must be zero or more.').max(10_000_000, 'That amount looks wrong.');
const title = z.string().trim().min(3, 'Give the request a short title.').max(160, 'Title is too long.');
const longText = z.string().trim().max(4000, 'Too long — keep it under 4,000 characters.');

export const leaveSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    halfDayStart: z.coerce.boolean().default(false),
    halfDayEnd: z.coerce.boolean().default(false),
    reason: longText.optional(),
    emergencyContact: z.string().trim().max(80).optional(),
    handoverTo: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The end date cannot be before the start date.',
    path: ['endDate'],
  });

const tripCostLine = z.object({
  category: z.enum(TRIP_COST_CATEGORIES),
  description: z.string().trim().max(200).optional(),
  amount: money,
});

export const tripSchema = z
  .object({
    country: z.string().trim().min(2, 'Enter the destination country.').max(60),
    city: z.string().trim().min(2, 'Enter the destination city.').max(60),
    isInternational: z.coerce.boolean().default(true),
    purpose: z.string().trim().min(10, 'Explain the purpose in a sentence.').max(2000),
    eventName: z.string().trim().max(120).optional(),
    partner: z.string().trim().max(120).optional(),
    startDate: isoDate,
    endDate: isoDate,
    outboundFlight: z.string().trim().max(40).optional(),
    inboundFlight: z.string().trim().max(40).optional(),
    hotelName: z.string().trim().max(120).optional(),
    hotelNights: z.coerce.number().int().min(0).max(120).default(0),
    hotelRatePerNight: money.default(0),
    transportation: z.string().trim().max(120).optional(),
    currency: z.enum(CURRENCIES).default('USD'),
    travelerIds: z.array(z.string().uuid()).max(20).default([]),
    costs: z.array(tripCostLine).min(1, 'Add at least one cost line.').max(20),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The return date cannot be before the departure date.',
    path: ['endDate'],
  });

const purchaseItem = z.object({
  itemName: z.string().trim().min(2, 'Name the item.').max(160),
  description: z.string().trim().max(300).optional(),
  quantity: z.coerce.number().positive('Quantity must be at least 1.').max(10_000),
  unitPrice: money,
});

export const purchaseSchema = z.object({
  category: z.enum(PURCHASE_CATEGORIES),
  vendorId: z.string().uuid().optional().or(z.literal('')),
  purpose: z.string().trim().min(10, 'Explain why this is needed.').max(2000),
  requiredDate: isoDate.optional().or(z.literal('')),
  quotationCount: z.coerce.number().int().min(0).max(10).default(0),
  currency: z.enum(CURRENCIES).default('USD'),
  items: z.array(purchaseItem).min(1, 'Add at least one line item.').max(30),
});

const expenseItem = z.object({
  expenseDate: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  merchant: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  amount: money,
  taxAmount: money.default(0),
});

export const expenseSchema = z.object({
  paymentMethod: z.enum(['PERSONAL', 'CORPORATE_CARD', 'COMPANY_ACCOUNT']).default('PERSONAL'),
  currency: z.enum(CURRENCIES).default('USD'),
  tripRequestId: z.string().uuid().optional().or(z.literal('')),
  description: longText.optional(),
  items: z.array(expenseItem).min(1, 'Add at least one expense line.').max(50),
});

export const genericSchema = z.object({
  title,
  category: z.string().trim().min(2, 'Choose or enter a category.').max(120),
  details: z.string().trim().min(10, 'Describe the request.').max(4000),
  amount: money.default(0),
  currency: z.enum(CURRENCIES).default('USD'),
  requestedDate: isoDate.optional().or(z.literal('')),
});

export type LeaveInput = z.infer<typeof leaveSchema>;
export type TripInput = z.infer<typeof tripSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type GenericInput = z.infer<typeof genericSchema>;

/** Flattens Zod issues into `{ fieldPath: message }` for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
