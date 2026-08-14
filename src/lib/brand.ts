/**
 * Product identity.
 *
 * One place for the platform name, the tagline and the module names, so a
 * rebrand is a single edit rather than a search across sixty files. Module keys
 * match the nav and the request types they own.
 */

export const BRAND = {
  /** Platform name. */
  name: 'OHMY ONE',
  /** Short form used where space is tight (mobile header, favicon alt). */
  short: 'ONE',
  /** Logo mark character. */
  mark: '1',
  tagline: 'One company. One system. AI-powered.',
  /** Legal/vendor name behind the product. */
  company: 'OHMY Hotel Group',
} as const;

export type ModuleKey =
  | 'approval'
  | 'people'
  | 'travel'
  | 'expense'
  | 'purchase'
  | 'finance'
  | 'ai';

export interface ModuleBrand {
  /** Product name, e.g. "ONE Approval". */
  name: string;
  /** The part after "ONE", used where the prefix is already implied. */
  suffix: string;
  /** i18n key for the Korean/English descriptive label. */
  labelKey: string;
  icon: string;
  href: string;
  /** Not yet built — shown as a roadmap item rather than a working link. */
  planned?: boolean;
}

export const MODULES: Record<ModuleKey, ModuleBrand> = {
  approval: { name: 'ONE Approval', suffix: 'Approval', labelKey: 'module.approval', icon: 'Inbox', href: '/approvals' },
  people: { name: 'ONE People', suffix: 'People', labelKey: 'module.people', icon: 'Users', href: '/people' },
  travel: { name: 'ONE Travel', suffix: 'Travel', labelKey: 'module.travel', icon: 'Plane', href: '/travel' },
  expense: { name: 'ONE Expense', suffix: 'Expense', labelKey: 'module.expense', icon: 'Receipt', href: '/expenses' },
  purchase: { name: 'ONE Purchase', suffix: 'Purchase', labelKey: 'module.purchase', icon: 'ShoppingCart', href: '/procurement' },
  finance: { name: 'ONE Finance', suffix: 'Finance', labelKey: 'module.finance', icon: 'Wallet', href: '/budgets', planned: true },
  ai: { name: 'ONE AI', suffix: 'AI', labelKey: 'module.ai', icon: 'Sparkles', href: '/assistant' },
};

/** Which module owns each request type — drives module labels on request pages. */
export const MODULE_FOR_REQUEST_TYPE: Record<string, ModuleKey> = {
  LEAVE: 'people',
  HR: 'people',
  BUSINESS_TRIP: 'travel',
  EXPENSE: 'expense',
  PURCHASE: 'purchase',
  GENERAL: 'approval',
};
