'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Cookies from 'js-cookie';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import type { AuthResponse } from '@gmao/shared';
import { Role } from '@gmao/shared';

type LoginFormValues = {
  email: string;
  password: string;
};

type SubmitState = 'idle' | 'pending' | 'success';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const WEB_ROLE_HOME: Partial<Record<Role, string>> = {
  [Role.ADMIN]: '/admin',
  [Role.SUPERVISOR]: '/supervisor',
  [Role.STOREKEEPER]: '/storekeeper',
};

export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  useEffect(() => {
    if (searchParams.get('error') === 'no_web_access') {
      setApiError(t('auth.noWebAccess'));
    } else if (searchParams.get('reason') === 'idle') {
      setApiError(t('auth.sessionExpired'));
    }
  }, [searchParams, t]);

  const loginSchema = z.object({
    email: z.string().email(t('auth.invalidEmail')),
    password: z.string().min(1, t('common.required')),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), mode: 'onSubmit' });

  const onSubmit = async (data: LoginFormValues) => {
    setApiError(null);
    setSubmitState('pending');
    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      const { accessToken, roles, userId, name, idleTimeoutHours } = res.data;

      const home = roles.map((r) => WEB_ROLE_HOME[r]).find((value): value is string => !!value);
      if (!home) {
        await api.post('/auth/logout').catch(() => undefined);
        Cookies.remove('user_roles', { path: '/' });
        setApiError(t('auth.noWebAccess'));
        setSubmitState('idle');
        return;
      }

      setAuth(accessToken, { id: userId, name, roles }, idleTimeoutHours);
      Cookies.set('user_roles', JSON.stringify(roles), { path: '/', expires: 7 });
      setSubmitState('success');
      setTimeout(() => router.push(home), 900);
    } catch {
      setApiError(t('auth.invalidCredentials'));
      setSubmitState('idle');
    }
  };

  const btnBg =
    submitState === 'success'
      ? '#2D7A3A'
      : submitState === 'pending'
        ? 'rgba(24,22,19,0.65)'
        : 'var(--sb-rail)';

  const btnLabel =
    submitState === 'success'
      ? '✓ Connecté'
      : submitState === 'pending'
        ? t('auth.loginLoading')
        : t('auth.loginButton');

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '360px',
        border: '1px solid var(--sb-border)',
        borderRadius: '2px',
        padding: '32px 28px',
        background: '#fff',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            fontFamily: MONO,
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--sb-text-primary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
        >
          {t('auth.login')}
        </h1>
        <p
          style={{
            fontFamily: MONO,
            fontSize: '10px',
            color: 'var(--sb-text-tertiary)',
            letterSpacing: '0.06em',
          }}
        >
          {t('auth.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} noValidate>
        <FormField
          label={t('auth.email')}
          htmlFor="email"
          required
          error={errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            {...register('email')}
            aria-invalid={!!errors.email}
          />
        </FormField>

        <div>
          <FormField
            label={t('auth.password')}
            htmlFor="password"
            required
            error={errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={!!errors.password}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => router.push('/forgot-password')}
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                color: 'var(--sb-text-secondary)',
                letterSpacing: '0.06em',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('auth.forgotPassword')}
            </button>
            <button
              type="button"
              onClick={() => router.push('/resend-setup')}
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                color: 'var(--sb-text-secondary)',
                letterSpacing: '0.06em',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('auth.resendSetupButton')}
            </button>
          </div>
        </div>

        {apiError && (
          <div
            role="alert"
            style={{
              padding: '8px 10px',
              borderRadius: '2px',
              background: 'rgba(181,53,37,0.07)',
              border: '1px solid rgba(181,53,37,0.35)',
              fontFamily: MONO,
              fontSize: '11px',
              color: 'var(--sb-p-crit)',
              letterSpacing: '0.04em',
            }}
          >
            {apiError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitState !== 'idle'}
          style={{
            width: '100%',
            height: '36px',
            border: 'none',
            borderRadius: '2px',
            fontFamily: MONO,
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            cursor: submitState === 'idle' ? 'pointer' : 'not-allowed',
            transition: 'background 0.3s',
            background: btnBg,
            color: 'var(--sb-text-on-rail)',
            opacity: submitState === 'pending' ? 0.75 : 1,
          }}
        >
          {btnLabel}
        </button>
      </form>
    </div>
  );
}
