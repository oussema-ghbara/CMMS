'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/auth.api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildResendSetupSchema, extractApiErrorMessage } from './resend-setup-utils';

type ResendSetupForm = {
  email: string;
};

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

export default function ResendSetupContent() {
  const router = useRouter();
  const { t } = useTranslation();

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const resendSchema = buildResendSetupSchema(t('common.required'), t('auth.invalidEmail'));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendSetupForm>({ resolver: zodResolver(resendSchema) });

  const onSubmit = async (data: ResendSetupForm) => {
    setApiError(null);
    try {
      await authApi.resendSetup(data.email);
      setIsSuccess(true);
    } catch (err) {
      const errorMsg = extractApiErrorMessage(err, t('common.error'));
      setApiError(errorMsg);
    }
  };

  if (isSuccess) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-2xl font-bold">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {t('common.success')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('auth.resendSetupSuccessDescription')}
          </p>
          <button type="button" style={btnPrimary} onClick={() => router.push('/login')}>
            {t('auth.backToLogin')}
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t('auth.resendSetupTitle')}</CardTitle>
        <CardDescription>{t('auth.resendSetupDescription')}</CardDescription>
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

          {apiError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {apiError}
            </div>
          )}

          <button type="submit" style={isSubmitting ? btnDisabled : btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('auth.sending')}
              </>
            ) : (
              t('auth.resendSetupButton')
            )}
          </button>

          <button type="button" style={btnSecondary} onClick={() => router.push('/login')}>
            {t('auth.backToLogin')}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
