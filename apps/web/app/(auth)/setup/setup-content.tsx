'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/auth.api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SetupForm = {
  password: string;
  passwordConfirm: string;
};

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const first = raw.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (first) return first;
  }
  return fallback;
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', background: 'var(--sb-rail)', color: 'var(--sb-text-on-rail)',
  border: 'none', borderRadius: 2, padding: '8px 16px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', background: 'transparent', color: 'var(--sb-text-primary)',
  border: '1px solid var(--sb-border)', borderRadius: 2, padding: '8px 16px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const btnDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: 'var(--sb-border)', color: 'var(--sb-text-tertiary)', cursor: 'not-allowed',
};

export default function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const token = searchParams.get('token');

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const setupSchema = z
    .object({
      password: z.string().min(1, t('common.required')),
      passwordConfirm: z.string().min(1, t('common.required')),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: t('auth.passwordsDoNotMatch'),
      path: ['passwordConfirm'],
    });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupForm>({ resolver: zodResolver(setupSchema) });

  if (!token) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {t('auth.errorTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('auth.invalidOrExpiredToken')}
          </p>
          <button type="button" style={btnSecondary} onClick={() => router.push('/resend-setup')}>
            {t('auth.resendSetupButton')}
          </button>
          <button type="button" style={btnPrimary} onClick={() => router.push('/login')}>
            {t('auth.backToLogin')}
          </button>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = async (data: SetupForm) => {
    setApiError(null);
    try {
      await authApi.setup(token, data.password);
      setIsSuccess(true);
      setIsRedirecting(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      const errorMsg = extractApiErrorMessage(err, t('common.error'));
      setApiError(errorMsg);
    }
  };

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {t('auth.accountSetup')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('auth.setupAccountSuccessDescription')}
          </p>
          {isRedirecting && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('auth.redirectingToLogin')}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('auth.setupAccountTitle')}
        </CardTitle>
        <CardDescription>{t('auth.setupAccountDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordConfirm">
              {t('auth.confirmPassword')}
            </Label>
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('passwordConfirm')}
              aria-invalid={!!errors.passwordConfirm}
            />
            {errors.passwordConfirm && (
              <p className="text-sm text-destructive">{errors.passwordConfirm.message}</p>
            )}
          </div>

          {apiError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {apiError}
            </div>
          )}

          <button type="submit" style={isSubmitting ? btnDisabled : btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('auth.settingUpAccount')}
              </>
            ) : (
              t('auth.setupAccountTitle')
            )}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
