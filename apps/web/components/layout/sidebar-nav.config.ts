import { LayoutDashboard, ClipboardList, Settings, Users, Package, Wrench, AlertCircle, CalendarClock, BarChart3, MapPin, Tags } from 'lucide-react';
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
      {
        labelKey: 'nav.dashboard',
        href: '/supervisor',
        icon: LayoutDashboard,
        match: 'exact',
      },
      {
        labelKey: 'nav.workOrders',
        href: '/supervisor/work-orders',
        icon: ClipboardList,
      },
      {
        labelKey: 'nav.assets',
        href: '/supervisor/assets',
        icon: Wrench,
      },
      {
        labelKey: 'nav.reports',
        href: '/supervisor/reports',
        icon: AlertCircle,
      },
      {
        labelKey: 'nav.preventivePlans',
        href: '/supervisor/preventive-plans',
        icon: CalendarClock,
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
      {
        labelKey: 'nav.inventory',
        href: '/storekeeper',
        icon: Package,
        match: 'exact',
      },
      {
        labelKey: 'nav.partRequests',
        href: '/storekeeper/part-requests',
        icon: ClipboardList,
      },
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
      {
        labelKey: 'nav.systemConfig',
        href: '/admin/system-config',
        icon: Settings,
      },
      {
        labelKey: 'nav.auditLog',
        href: '/admin/audit-log',
        icon: BarChart3,
      },
    ],
  },
];