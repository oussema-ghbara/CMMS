'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ResetForm = {
  password: string;
  passwordConfirm: string;
};

export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const token = searchParams.get('token');

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const resetSchema = z
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
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
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
            <Button
              onClick={() => router.push('/login')}
              className="w-full"
            >
              {t('auth.backToLogin')}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const onSubmit = async (data: ResetForm) => {
    setApiError(null);
    try {
      await authApi.resetPassword(token, data.password);
      setIsSuccess(true);
      setIsRedirecting(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      const errorMsg = (err as any)?.response?.data?.message || t('common.error');
      setApiError(errorMsg);
    }
  };

  if (isSuccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {t('auth.passwordUpdated')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('auth.resetPasswordSuccessDescription')}
            </p>
            {isRedirecting && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('auth.redirectingToLogin')}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {t('auth.resetPasswordTitle')}
          </CardTitle>
          <CardDescription>{t('auth.resetPasswordDescription')}</CardDescription>
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t('auth.resettingPassword')}
                </>
              ) : (
                t('auth.resetPasswordTitle')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
