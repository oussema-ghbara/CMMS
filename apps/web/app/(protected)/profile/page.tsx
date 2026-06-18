'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { usersApi } from '@/lib/users.api';
import { authApi } from '@/lib/auth.api';
import { formatDate, getChangePasswordErrorMessage } from './profile-utils';
import { useAuthStore } from '@/store/auth.store';
import { Mono } from '@/components/ui/mono';

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const ROLE_PALETTE: Record<string, { color: string; bg: string }> = {
  ADMIN:       { color: '#3A3055', bg: '#EEECF6' },
  SUPERVISOR:  { color: '#5A3FA0', bg: '#F0ECFC' },
  STOREKEEPER: { color: '#1A6B55', bg: '#E6F5F0' },
  TECHNICIAN:  { color: '#3A6A8C', bg: '#EDF3F8' },
  REQUESTER:   { color: '#7A5535', bg: '#FAF0E8' },
};

const inputS: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--sb-border)',
  borderRadius: 2,
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--sb-text-primary)',
  background: 'var(--sb-bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

function RoleBadge({ role, label }: { role: string; label: string }) {
  const palette = ROLE_PALETTE[role] ?? { color: 'var(--sb-text-secondary)', bg: 'var(--sb-surface)' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: palette.bg,
      border: `1px solid ${palette.color}44`,
      borderRadius: 2,
      padding: '2px 8px',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: palette.color, display: 'inline-block', flexShrink: 0 }} />
      <Mono size={8} color={palette.color} weight={700}>{label}</Mono>
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--sb-border)' }}>
      <div style={{ width: 180, padding: '9px 14px', flexShrink: 0 }}>
        <Mono size={9} color="var(--sb-text-tertiary)">{label}</Mono>
      </div>
      <div style={{ flex: 1, padding: '9px 14px', borderLeft: '1px solid var(--sb-border)' }}>
        <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500 }}>{value}</span>
      </div>
    </div>
  );
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
  } = useForm<ChangePasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

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

  const initials = profile?.name
    ? profile.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const primaryRole = profile?.roles?.[0];
  const avatarColor = primaryRole ? (ROLE_PALETTE[primaryRole]?.color ?? '#3A3055') : '#3A3055';

  const emailEnabled = prefs?.emailNotificationsEnabled !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>

      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em', marginBottom: 3 }}>
          {t('profile.title')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)' }}>
          {t('profile.subtitle')}
        </div>
      </div>

      <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-border)', padding: '8px 14px' }}>
          <Mono size={10} color="var(--sb-text-secondary)" tracking="0.13em">
            {t('profile.sections.info').toUpperCase()}
          </Mono>
        </div>

        {profileLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
            <Loader2 style={{ width: 20, height: 20, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>

            <div style={{ padding: '16px 14px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                background: avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '0.04em',
                }}>
                  {initials}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sb-text-primary)', marginBottom: 2 }}>
                  {profile?.name ?? '—'}
                </div>
                <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 11, color: 'var(--sb-text-tertiary)', marginBottom: 10 }}>
                  {profile?.email ?? '—'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(profile?.roles ?? []).map((role) => (
                    <RoleBadge key={role} role={role} label={t(`roles.${role}`)} />
                  ))}
                </div>
              </div>
            </div>

            <MetaRow
              label={t('profile.fields.lastLogin').toUpperCase()}
              value={formatDate(profile?.lastLoginAt, t('profile.fields.never'))}
            />
            <MetaRow
              label={t('profile.fields.memberSince').toUpperCase()}
              value={formatDate(profile?.createdAt, '—')}
            />
          </>
        )}
      </div>

      <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-border)', padding: '8px 14px' }}>
          <Mono size={10} color="var(--sb-text-secondary)" tracking="0.13em">
            {t('profile.sections.preferences').toUpperCase()}
          </Mono>
        </div>

        {prefsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
            <Loader2 style={{ width: 18, height: 18, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', marginBottom: 2 }}>
                {t('userPreferences.emailNotifications.label')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', lineHeight: 1.5 }}>
                {t('userPreferences.emailNotifications.description')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Mono size={9} color={emailEnabled ? '#2E7A4E' : 'var(--sb-text-tertiary)'}>
                {emailEnabled
                  ? t('userPreferences.emailNotifications.enabled')
                  : t('userPreferences.emailNotifications.disabled')}
              </Mono>
              <button
                type="button"
                role="switch"
                aria-checked={emailEnabled}
                disabled={emailPrefMutation.isPending}
                onClick={() => emailPrefMutation.mutate(!emailEnabled)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: emailEnabled ? '#2E7A4E' : 'var(--sb-border-strong)',
                  border: 'none',
                  cursor: emailPrefMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: emailPrefMutation.isPending ? 0.6 : 1,
                  transition: 'background 0.15s',
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transform: emailEnabled ? 'translateX(21px)' : 'translateX(3px)',
                  transition: 'transform 0.15s',
                }} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--sb-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          background: 'var(--sb-surface)',
          borderBottom: showPasswordForm ? '1px solid var(--sb-border)' : 'none',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Mono size={10} color="var(--sb-text-secondary)" tracking="0.13em">
            {t('profile.sections.security').toUpperCase()}
          </Mono>
          {!showPasswordForm && (
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'transparent',
                border: '1px solid var(--sb-border)',
                borderRadius: 2,
                padding: '3px 10px',
                cursor: 'pointer',
                color: 'var(--sb-text-secondary)',
                fontSize: 11,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; e.currentTarget.style.color = 'var(--sb-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
            >
              <KeyRound style={{ width: 12, height: 12 }} />
              {t('profile.changePassword.title')}
            </button>
          )}
        </div>

        {!showPasswordForm && (
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--sb-text-tertiary)' }}>
              {t('profile.sections.securityDescription')}
            </div>
          </div>
        )}

        {showPasswordForm && (
          <form onSubmit={handleSubmit(onSubmitPasswordChange)} style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('profile.changePassword.currentPassword')}
              </Mono>
              <input
                type="password"
                autoComplete="current-password"
                {...register('currentPassword', { required: true })}
                style={{ ...inputS, borderColor: errors.currentPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)', maxWidth: 320 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = errors.currentPassword ? 'var(--sb-p-crit)' : 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = errors.currentPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
              />
              {errors.currentPassword && (
                <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>
                  {errors.currentPassword.message}
                </Mono>
              )}
            </div>

            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('profile.changePassword.newPassword')}
              </Mono>
              <input
                type="password"
                autoComplete="new-password"
                {...register('newPassword', { required: true, minLength: 8 })}
                style={{ ...inputS, borderColor: errors.newPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)', maxWidth: 320 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = errors.newPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
              />
            </div>

            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('profile.changePassword.confirmPassword')}
              </Mono>
              <input
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword', {
                  required: true,
                  validate: (v) => v === newPassword || t('profile.changePassword.errorMismatch'),
                })}
                style={{ ...inputS, borderColor: errors.confirmPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)', maxWidth: 320 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = errors.confirmPassword ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
              />
              {errors.confirmPassword && (
                <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>
                  {errors.confirmPassword.message}
                </Mono>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: changePasswordMutation.isPending ? 'var(--sb-border)' : 'var(--sb-text-primary)',
                  color: changePasswordMutation.isPending ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
                  border: 'none',
                  borderRadius: 2,
                  padding: '6px 14px',
                  cursor: changePasswordMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                }}
              >
                {changePasswordMutation.isPending && (
                  <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                )}
                {changePasswordMutation.isPending
                  ? t('profile.changePassword.submitting')
                  : t('profile.changePassword.submit')}
              </button>
              <button
                type="button"
                onClick={() => { reset(); setShowPasswordForm(false); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--sb-border)',
                  borderRadius: 2,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--sb-text-secondary)',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; e.currentTarget.style.color = 'var(--sb-text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
