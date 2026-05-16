import { LayoutDashboard, ClipboardList, Settings, Users, Package, Wrench, AlertCircle, CalendarClock, BarChart3, MapPin, Tags, ListChecks, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Role } from '@gmao/shared';
import type { LucideIcon } from 'lucide-react';

export interface SidebarPageItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  match?: 'exact' | 'prefix';
}

export interface SidebarModuleItem {
  role: Role;
  labelKey: string;
  icon: LucideIcon;
  items: SidebarPageItem[];
}

export const SIDEBAR_MODULES: SidebarModuleItem[] = [
  {
    role: Role.SUPERVISOR,
    labelKey: 'roles.SUPERVISOR',
    icon: LayoutDashboard,
    items: [
      // Overview first
      {
        labelKey: 'nav.dashboard',
        href: '/supervisor',
        icon: LayoutDashboard,
        match: 'exact',
      },
      // Active operations
      {
        labelKey: 'nav.workOrders',
        href: '/supervisor/work-orders',
        icon: ClipboardList,
      },
      {
        labelKey: 'nav.validationQueue',
        href: '/supervisor/validation-queue',
        icon: ShieldCheck,
      },
      // Planning
      {
        labelKey: 'nav.preventivePlans',
        href: '/supervisor/preventive-plans',
        icon: CalendarClock,
      },
      // Reference data
      {
        labelKey: 'nav.assets',
        href: '/supervisor/assets',
        icon: Wrench,
      },
      {
        labelKey: 'nav.categories',
        href: '/supervisor/categories',
        icon: ListChecks,
      },
      // Reporting last
      {
        labelKey: 'nav.reports',
        href: '/supervisor/reports',
        icon: AlertCircle,
      },
      {
        labelKey: 'nav.analytics',
        href: '/supervisor/analytics',
        icon: BarChart3,
      },
    ],
  },
  {
    role: Role.STOREKEEPER,
    labelKey: 'roles.STOREKEEPER',
    icon: Package,
    items: [
      // Primary stock view
      {
        labelKey: 'nav.inventory',
        href: '/storekeeper',
        icon: Package,
        match: 'exact',
      },
      // Incoming work
      {
        labelKey: 'nav.partRequests',
        href: '/storekeeper/part-requests',
        icon: ClipboardList,
      },
      // Alerts
      {
        labelKey: 'nav.lowStock',
        href: '/storekeeper/low-stock',
        icon: AlertTriangle,
      },
      // Reporting last
      {
        labelKey: 'nav.analytics',
        href: '/storekeeper/analytics',
        icon: BarChart3,
      },
    ],
  },
  {
    role: Role.ADMIN,
    labelKey: 'roles.ADMIN',
    icon: Users,
    items: [
      // Core entity management
      {
        labelKey: 'nav.users',
        href: '/admin',
        icon: Users,
        match: 'exact',
      },
      {
        labelKey: 'nav.locations',
        href: '/admin/locations',
        icon: MapPin,
      },
      {
        labelKey: 'nav.categories',
        href: '/admin/categories',
        icon: Tags,
      },
      // System configuration
      {
        labelKey: 'nav.systemConfig',
        href: '/admin/system-config',
        icon: Settings,
      },
      // Monitoring and reporting last
      {
        labelKey: 'nav.analytics',
        href: '/admin/analytics',
        icon: Activity,
      },
      {
        labelKey: 'nav.auditLog',
        href: '/admin/audit-log',
        icon: BarChart3,
      },
    ],
  },
];