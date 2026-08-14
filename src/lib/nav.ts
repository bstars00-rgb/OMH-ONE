import type { Capability } from '@/lib/rbac';

export interface NavItem {
  /** i18n key — the label is resolved at render so the nav follows the locale. */
  labelKey: string;
  href: string;
  icon: string;
  capability?: Capability;
  /** Match sub-routes as active (e.g. /requests/abc highlights My Requests). */
  matchPrefix?: boolean;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

/**
 * Nav visibility is driven by the same capability map the pages enforce, so a
 * hidden item and a forbidden page can never disagree. Hiding is cosmetic —
 * every page re-checks server-side.
 */
export const NAV: NavSection[] = [
  {
    labelKey: 'nav.section.main',
    items: [
      { labelKey: 'nav.home', href: '/', icon: 'LayoutDashboard' },
      { labelKey: 'nav.assistant', href: '/assistant', icon: 'Sparkles' },
    ],
  },
  {
    labelKey: 'nav.section.work',
    items: [
      { labelKey: 'nav.approvals', href: '/approvals', icon: 'Inbox', matchPrefix: true },
      { labelKey: 'nav.requests', href: '/requests', icon: 'FileText', matchPrefix: true },
    ],
  },
  {
    labelKey: 'nav.section.people',
    items: [
      { labelKey: 'nav.people', href: '/people', icon: 'Users', capability: 'employee.viewAll', matchPrefix: true },
      { labelKey: 'nav.leave', href: '/leave', icon: 'CalendarDays', matchPrefix: true },
      { labelKey: 'nav.calendar', href: '/calendar', icon: 'CalendarRange' },
    ],
  },
  {
    labelKey: 'nav.section.finance',
    items: [
      { labelKey: 'nav.expenses', href: '/expenses', icon: 'Receipt', matchPrefix: true },
      { labelKey: 'nav.procurement', href: '/procurement', icon: 'ShoppingCart', matchPrefix: true },
      { labelKey: 'nav.budgets', href: '/budgets', icon: 'Wallet', capability: 'finance.view' },
    ],
  },
  {
    labelKey: 'nav.section.travel',
    items: [{ labelKey: 'nav.travel', href: '/travel', icon: 'Plane', matchPrefix: true }],
  },
  {
    labelKey: 'nav.section.management',
    items: [
      { labelKey: 'nav.analytics', href: '/analytics', icon: 'ChartColumn', capability: 'analytics.view' },
      { labelKey: 'nav.reports', href: '/reports', icon: 'FileSpreadsheet', capability: 'reports.export' },
      { labelKey: 'nav.audit', href: '/audit', icon: 'ScrollText', capability: 'audit.view' },
    ],
  },
  {
    labelKey: 'nav.section.admin',
    items: [
      { labelKey: 'nav.admin.workflows', href: '/admin/workflows', icon: 'GitBranch', capability: 'admin.workflow', matchPrefix: true },
      { labelKey: 'nav.admin.policies', href: '/admin/policies', icon: 'ShieldCheck', capability: 'admin.policy' },
      { labelKey: 'nav.admin.organization', href: '/admin/organization', icon: 'Building2', capability: 'admin.organization' },
      { labelKey: 'nav.admin.users', href: '/admin/users', icon: 'UserCog', capability: 'admin.users' },
      { labelKey: 'nav.admin.settings', href: '/admin/settings', icon: 'Settings', capability: 'admin.settings' },
    ],
  },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.href === '/') return pathname === '/';
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}
