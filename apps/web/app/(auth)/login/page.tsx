import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--sb-bg)' }}>
      <div
        style={{
          height: '34px',
          background: 'var(--sb-rail)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--sb-text-on-rail)',
            letterSpacing: '0.06em',
          }}
        >
          GMAO
        </span>
        <span style={{ width: '1px', height: '12px', background: 'var(--sb-text-dim-rail)', opacity: 0.5 }} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: '10px',
            color: 'var(--sb-text-dim-rail)',
            letterSpacing: '0.08em',
          }}
        >
          MAINTENANCE
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 20px',
        }}
      >
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

      <div
        style={{
          height: '28px',
          background: 'var(--sb-surface)',
          borderTop: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: '10px',
            color: 'var(--sb-text-tertiary)',
            letterSpacing: '0.08em',
          }}
        >
          Session sécurisée · Authentification interne
        </span>
      </div>
    </div>
  );
}
