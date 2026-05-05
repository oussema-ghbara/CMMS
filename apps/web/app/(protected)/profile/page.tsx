'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, User, Mail, Shield, Clock, CalendarDays, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { usersApi } from '@/lib/users.api';
import { authApi } from '@/lib/auth.api';
import { formatDate, getChangePasswordErrorMessage } from './profile-utils';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}


export default function ProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => usersApi.getMe(),
    enabled: isInitialized,
  });

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: () => usersApi.getMyPreferences(),
    enabled: isInitialized,
  });

  const emailPrefMutation = useMutation({
    mutationFn: (enabled: boolean) => usersApi.updateEmailNotifications(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'preferences'] });
      toast.success(t('userPreferences.emailNotifications.updateSuccess'));
    },
    onError: () => toast.error(t('userPreferences.emailNotifications.updateError')),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
    watch,
  } = useForm<ChangePasswordFormValues>({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const newPassword = watch('newPassword');

  const changePasswordMutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      authApi.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast.success(t('profile.changePassword.success'));
      reset();
      setShowPasswordForm(false);
    },
    onError: (error) => {
      const msg = getChangePasswordErrorMessage(error);
      if (msg.includes('incorrectCurrentPassword') || msg.includes('Incorrect')) {
        setError('currentPassword', { message: t('profile.changePassword.incorrectCurrentPassword') });
      } else {
        toast.error(t('profile.changePassword.errorGeneric'));
      }
    },
  });

  const onSubmitPasswordChange = (values: ChangePasswordFormValues) => {
    if (values.newPassword !== values.confirmPassword) {
      setError('confirmPassword', { message: t('profile.changePassword.errorMismatch') });
      return;
    }
    changePasswordMutation.mutate(values);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-muted-foreground">{t('profile.subtitle')}</p>
      </div>

      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.sections.info')}</CardTitle>
          <CardDescription>{t('profile.sections.infoDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {profileLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <dl className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-xs text-muted-foreground">{t('profile.fields.name')}</dt>
                  <dd className="text-sm font-medium">{profile?.name ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-xs text-muted-foreground">{t('profile.fields.email')}</dt>
                  <dd className="text-sm font-medium">{profile?.email ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-xs text-muted-foreground">{t('profile.fields.roles')}</dt>
                  <dd className="flex flex-wrap gap-1 mt-0.5">
                    {(profile?.roles ?? []).map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {t(`roles.${role}`)}
                      </Badge>
                    ))}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-xs text-muted-foreground">{t('profile.fields.lastLogin')}</dt>
                  <dd className="text-sm font-medium">
                    {formatDate(profile?.lastLoginAt, t('profile.fields.never'))}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-xs text-muted-foreground">{t('profile.fields.memberSince')}</dt>
                  <dd className="text-sm font-medium">
                    {formatDate(profile?.createdAt, '—')}
                  </dd>
                </div>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.sections.preferences')}</CardTitle>
          <CardDescription>{t('profile.sections.preferencesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {prefsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('userPreferences.emailNotifications.label')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('userPreferences.emailNotifications.description')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={emailPrefMutation.isPending}
                onClick={() => emailPrefMutation.mutate(!(prefs?.emailNotificationsEnabled ?? true))}
              >
                {emailPrefMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {prefs?.emailNotificationsEnabled !== false
                  ? t('userPreferences.emailNotifications.enabled')
                  : t('userPreferences.emailNotifications.disabled')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security / change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('profile.sections.security')}</CardTitle>
              <CardDescription>{t('profile.sections.securityDescription')}</CardDescription>
            </div>
            {!showPasswordForm && (
              <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>
                <KeyRound className="mr-2 h-3.5 w-3.5" />
                {t('profile.changePassword.title')}
              </Button>
            )}
          </div>
        </CardHeader>
        {showPasswordForm && (
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitPasswordChange)} className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">{t('profile.changePassword.currentPassword')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...register('currentPassword', { required: true })}
                />
                {errors.currentPassword && (
                  <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t('profile.changePassword.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('newPassword', { required: true, minLength: 8 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t('profile.changePassword.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPassword', {
                    required: true,
                    validate: (v) => v === newPassword || t('profile.changePassword.errorMismatch'),
                  })}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {changePasswordMutation.isPending
                    ? t('profile.changePassword.submitting')
                    : t('profile.changePassword.submit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { reset(); setShowPasswordForm(false); }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
