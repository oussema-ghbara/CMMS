'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SIDEBAR_MODULES } from './sidebar-nav.config';
import { isPathActive } from './sidebar-utils';
import { NotificationMenu } from './notification-menu';

function getPageLabelKey(pathname: string): string | null {
  let match: { labelKey: string; hrefLength: number } | null = null;

  for (const moduleItem of SIDEBAR_MODULES) {
    for (const pageItem of moduleItem.items) {
      if (isPathActive(pathname, pageItem.href, pageItem.match)) {
        const candidate = { labelKey: pageItem.labelKey, hrefLength: pageItem.href.length };
        if (!match || candidate.hrefLength > match.hrefLength) {
          match = candidate;
        }
      }
    }
  }

  return match?.labelKey ?? null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  const pageLabelKey = useMemo(() => getPageLabelKey(pathname), [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {pageLabelKey ? t(pageLabelKey) : t('sidebar.navigation')}
            </p>
            <p className="truncate text-xs text-muted-foreground">{t('sidebar.brandSubtitle')}</p>
          </div>

          <div className="flex items-center gap-2">
            <NotificationMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
