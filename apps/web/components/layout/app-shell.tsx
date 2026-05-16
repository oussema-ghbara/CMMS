'use client';

import type { ReactNode } from 'react';
import { useIdleTimeout } from '@/hooks/use-idle-timeout';
import { SystemRail } from './system-rail';
import { ModuleBar } from './module-bar';

export function AppShell({ children }: { children: ReactNode }) {
  useIdleTimeout();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--sb-bg)',
      }}
    >
      <SystemRail />
      <ModuleBar />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--sb-bg)',
          padding: '24px',
        }}
      >
        {children}
      </main>
    </div>
  );
}
