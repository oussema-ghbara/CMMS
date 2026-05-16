'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { SIDEBAR_MODULES } from './sidebar-nav.config';
import { isModuleActive, isPathActive } from './sidebar-utils';

export function ModuleBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user, activeRole } = useAuthStore();

  if (!user) return null;

  // Derive active module from pathname first (routes are role-scoped).
  // Fall back to activeRole when on a non-module path (e.g. /profile).
  const moduleFromPath = SIDEBAR_MODULES.find(
    (m) => user.roles.includes(m.role) && isModuleActive(pathname, m),
  );
  const moduleFromRole = SIDEBAR_MODULES.find(
    (m) => m.role === activeRole && user.roles.includes(m.role),
  );
  const activeModule = moduleFromPath ?? moduleFromRole;

  if (!activeModule) return null;

  return (
    <div
      style={{
        height: '40px',
        background: 'var(--sb-surface)',
        borderBottom: '1px solid var(--sb-border)',
        display: 'flex',
        alignItems: 'stretch',
        padding: '0 16px',
        flexShrink: 0,
        gap: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingRight: '14px',
          borderRight: '1px solid var(--sb-border)',
          marginRight: '8px',
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: '10px',
            fontWeight: '600',
            color: 'var(--sb-text-secondary)',
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
          }}
        >
          {t(activeModule.labelKey)}
        </span>
      </div>

      <nav
        style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}
        aria-label={t(activeModule.labelKey)}
      >
        {activeModule.items.map((item) => {
          const isActive = isPathActive(pathname, item.href, item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 12px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '11px',
                fontWeight: isActive ? '600' : '400',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: isActive ? 'var(--sb-text-primary)' : 'var(--sb-text-secondary)',
                borderBottom: isActive
                  ? '2px solid var(--sb-text-primary)'
                  : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'color 120ms, border-color 120ms',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
