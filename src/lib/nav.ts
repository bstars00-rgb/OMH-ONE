import type { Capability } from '@/lib/rbac';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  capability?: Capability;
  /** Match sub-routes as active (e.g. /requests/abc highlights My Requests). */
  matchPrefix?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Nav visibility is driven by the same capability map the pages enforce, so a
 * hidden item and a forbidden page can never disagree. Hiding is cosmetic —
 * every page re-checks server-side.
 */
export const NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Home', href: '/', icon: 'LayoutDashboard' },
      { label: 'AI Assistant', href: '/assistant', icon: 'Sparkles' },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Approvals', href: '/approvals', icon: 'Inbox', matchPrefix: true },
      { label: 'My Requests', href: '/requests', icon: 'FileText', matchPrefix: true },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Employees', href: '/people', icon: 'Users', capability: 'employee.viewAll', matchPrefix: true },
      { label: 'Leave', href: '/leave', icon: 'CalendarDays', matchPrefix: true },
      { label: 'Calendar', href: '/calendar', icon: 'CalendarRange' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses', href: '/expenses', icon: 'Receipt', matchPrefix: true },
      { label: 'Purchase Requests', href: '/procurement', icon: 'ShoppingCart', matchPrefix: true },
      { label: 'Budgets', href: '/budgets', icon: 'Wallet', capability: 'finance.view' },
    ],
  },
  {
    label: 'Travel',
    items: [{ label: 'Business Trips', href: '/travel', icon: 'Plane', matchPrefix: true }],
  },
  {
    label: 'Management',
    items: [
      { label: 'Analytics', href: '/analytics', icon: 'ChartColumn', capability: 'analytics.view' },
      { label: 'Reports', href: '/reports', icon: 'FileSpreadsheet', capability: 'reports.export' },
      { label: 'Audit Logs', href: '/audit', icon: 'ScrollText', capability: 'audit.view' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Workflow Builder', href: '/admin/workflows', icon: 'GitBranch', capability: 'admin.workflow', matchPrefix: true },
      { label: 'Policies', href: '/admin/policies', icon: 'ShieldCheck', capability: 'admin.policy' },
      { label: 'Organization', href: '/admin/organization', icon: 'Building2', capability: 'admin.organization' },
      { label: 'Users', href: '/admin/users', icon: 'UserCog', capability: 'admin.users' },
      { label: 'System Settings', href: '/admin/settings', icon: 'Settings', capability: 'admin.settings' },
    ],
  },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.href === '/') return pathname === '/';
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}
