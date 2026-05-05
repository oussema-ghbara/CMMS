'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import {
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/users.api';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { SIDEBAR_MODULES } from './sidebar-nav.config';
import { isModuleActive, isPathActive } from './sidebar-utils';

const COLLAPSED_STORAGE_KEY = 'gmao.sidebar.collapsed';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type SidebarLinkProps = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  depth?: 0 | 1;
};

function SidebarLink({ href, label, icon: Icon, active, collapsed, depth = 0 }: SidebarLinkProps) {
  const baseClasses = cn(
    'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60',
    collapsed && 'justify-center px-0',
    depth === 1 && !collapsed && 'pl-8',
    active
      ? 'bg-sidebar-primary/12 text-sidebar-primary'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  );

  const indicatorClasses = cn('absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary transition-opacity', active ? 'opacity-100' : 'opacity-0');

  return (
    <Link href={href} className={baseClasses} aria-current={active ? 'page' : undefined}>
      {active && !collapsed ? <span className={indicatorClasses} aria-hidden="true" /> : null}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
    </Link>
  );
}

function SidebarModuleMenu({
  label,
  collapsed,
  active,
  icon: Icon,
  items,
  pathname,
}: {
  label: string;
  collapsed: boolean;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  pathname: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    match?: 'exact' | 'prefix';
  }>;
}) {
  const router = useRouter();

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn(
              'relative h-11 w-11 rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-primary/12 text-sidebar-primary hover:bg-sidebar-primary/12 hover:text-sidebar-primary',
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={12} className="w-56 border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-sidebar-border" />
          {items.map((item) => {
            const itemActive = isPathActive(pathname, item.href, item.match);

            return (
              <DropdownMenuItem
                key={item.href}
                onSelect={() => router.push(item.href)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground outline-none focus:bg-sidebar-accent focus:text-sidebar-accent-foreground',
                  itemActive && 'bg-sidebar-accent/80 text-sidebar-primary',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <section className="space-y-1">
      <div className="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <span className={cn('ml-auto h-px flex-1 bg-sidebar-border/70', active && 'bg-sidebar-primary/40')} />
      </div>
      <div className="space-y-1 border-l border-sidebar-border/60 pl-2">
        {items.map((item) => {
          const itemActive = isPathActive(pathname, item.href, item.match);

          return (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={itemActive}
              collapsed={false}
              depth={1}
            />
          );
        })}
      </div>
    </section>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);

    const storedValue = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (storedValue !== null) {
      setCollapsed(storedValue === 'true');
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed, hydrated]);

  const visibleModules = SIDEBAR_MODULES.filter((module) => user?.roles.includes(module.role));

  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: ['users', 'me', 'preferences'],
    queryFn: () => usersApi.getMyPreferences(),
    enabled: !!user,
  });

  const emailPrefMutation = useMutation({
    mutationFn: (enabled: boolean) => usersApi.updateEmailNotifications(enabled),
    onSuccess: (data) => {
      void queryClient.setQueryData(['users', 'me', 'preferences'], data);
      toast.success(t('userPreferences.emailNotifications.updateSuccess'));
    },
    onError: () => toast.error(t('userPreferences.emailNotifications.updateError')),
  });

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
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-20' : 'w-80',
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border px-4', collapsed && 'justify-center px-3')}>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary/12 text-sidebar-primary">
          <Wrench className="h-4 w-4" />
        </div>
        {!collapsed ? (
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-semibold tracking-wide">GMAO</span>
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? t('nav.actions.expandSidebar') : t('nav.actions.collapseSidebar')}
          className="h-9 w-9 shrink-0 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className={cn('space-y-6', collapsed && 'space-y-3')} aria-label={t('sidebar.navigation')}>
          {visibleModules.map((module) => {
            const moduleActive = isModuleActive(pathname, module);
            const moduleLabel = t(module.labelKey);

            return (
              <SidebarModuleMenu
                key={module.role}
                label={moduleLabel}
                collapsed={collapsed}
                active={moduleActive}
                icon={module.icon}
                pathname={pathname}
                items={module.items.map((item) => ({
                  label: t(item.labelKey),
                  href: item.href,
                  icon: item.icon,
                  match: item.match,
                }))}
              />
            );
          })}
        </nav>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 rounded-xl px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{user ? getInitials(user.name) : '??'}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <span className="truncate text-sm font-medium leading-none">{user?.name}</span>
                  <span className="mt-1 truncate text-xs text-sidebar-foreground/60">
                    {user?.roles.map((role) => t(`roles.${role}`)).join(', ')}
                  </span>
                </div>
              ) : null}
              <span className="sr-only">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-64 border-sidebar-border bg-sidebar text-sidebar-foreground">
            <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/profile">
                <UserCircle className="mr-2 h-4 w-4" />
                {t('profile.profileLink')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuItem
              onClick={() =>
                emailPrefMutation.mutate(!(prefs?.emailNotificationsEnabled ?? true))
              }
              disabled={emailPrefMutation.isPending}
              className="cursor-pointer"
            >
              <Mail className="mr-2 h-4 w-4" />
              <span className="flex-1">{t('userPreferences.emailNotifications.label')}</span>
              <span className="text-xs text-sidebar-foreground/60">
                {prefs?.emailNotificationsEnabled !== false
                  ? t('userPreferences.emailNotifications.enabled')
                  : t('userPreferences.emailNotifications.disabled')}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!collapsed ? (
        <div className="border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-foreground/50" />
      ) : null}
    </aside>
  );
}