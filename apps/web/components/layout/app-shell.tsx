'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import {
  LayoutDashboard,
  ClipboardList,
  Settings,
  Users,
  Package,
  Wrench,
  AlertCircle,
  CalendarClock,
  BarChart3,
  Bell,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Role } from '@gmao/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/supervisor',
    icon: LayoutDashboard,
    roles: [Role.SUPERVISOR],
  },
  {
    label: 'Ordres de travail',
    href: '/supervisor/work-orders',
    icon: ClipboardList,
    roles: [Role.SUPERVISOR],
  },
  {
    label: 'Équipements',
    href: '/supervisor/assets',
    icon: Wrench,
    roles: [Role.SUPERVISOR],
  },
  {
    label: 'Signalements',
    href: '/supervisor/reports',
    icon: AlertCircle,
    roles: [Role.SUPERVISOR],
  },
  {
    label: 'Plans préventifs',
    href: '/supervisor/preventive-plans',
    icon: CalendarClock,
    roles: [Role.SUPERVISOR],
  },
  {
    label: 'Analytiques',
    href: '/supervisor/analytics',
    icon: BarChart3,
    roles: [Role.SUPERVISOR],
  },
  // Storekeeper
  {
    label: 'Inventaire',
    href: '/storekeeper',
    icon: Package,
    roles: [Role.STOREKEEPER],
  },
  {
    label: 'Demandes de pièces',
    href: '/storekeeper/part-requests',
    icon: ClipboardList,
    roles: [Role.STOREKEEPER],
  },
  // Admin
  {
    label: 'Utilisateurs',
    href: '/admin',
    icon: Users,
    roles: [Role.ADMIN],
  },
  {
    label: 'Configuration',
    href: '/admin/system-config',
    icon: Settings,
    roles: [Role.ADMIN],
  },
  {
    label: "Journal d'audit",
    href: '/admin/audit-log',
    icon: BarChart3,
    roles: [Role.ADMIN],
  },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();

  const visibleNav = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => user?.roles.includes(r)),
  );

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore logout errors
    } finally {
      clearAuth();
      Cookies.remove('user_roles', { path: '/' });
      router.push('/login');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
            <Wrench className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">GMAO</span>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
              </Link>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* User menu */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {user ? getInitials(user.name) : '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium leading-none">{user?.name}</span>
                  <span className="text-xs text-sidebar-foreground/60 mt-0.5">
                    {user?.roles
                      .map((r) =>
                        r === Role.ADMIN
                          ? 'Administrateur'
                          : r === Role.SUPERVISOR
                            ? 'Superviseur'
                            : r === Role.STOREKEEPER
                              ? 'Magasinier'
                              : r,
                      )
                      .join(', ')}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-end border-b bg-background px-6 gap-2">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
            >
              0
            </Badge>
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
