'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Cookies from 'js-cookie';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AuthResponse } from '@gmao/shared';
import { Role } from '@gmao/shared';

type LoginForm = {
  email: string;
  password: string;
};

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
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), mode: 'onSubmit' });

  const onSubmit = async (data: LoginForm) => {
    setApiError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      const { accessToken, roles, userId, name, idleTimeoutHours } = res.data;

      const home = roles.map((r) => WEB_ROLE_HOME[r]).find((value): value is string => !!value);
      if (!home) {
        await api.post('/auth/logout').catch(() => undefined);
        Cookies.remove('user_roles', { path: '/' });
        setApiError(t('auth.noWebAccess'));
        return;
      }

      setAuth(accessToken, { id: userId, name, roles }, idleTimeoutHours);
      Cookies.set('user_roles', JSON.stringify(roles), { path: '/', expires: 7 });
      router.push(home);
    } catch {
      setApiError(t('auth.invalidCredentials'));
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t('auth.login')}</CardTitle>
        <CardDescription>{t('auth.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              {...register('email')}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs text-primary"
                onClick={() => router.push('/forgot-password')}
              >
                {t('auth.forgotPassword')}
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs text-primary"
              onClick={() => router.push('/resend-setup')}
            >
              {t('auth.resendSetupButton')}
            </Button>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {apiError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {apiError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                {t('auth.loginLoading')}
              </>
            ) : (
              t('auth.loginButton')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
