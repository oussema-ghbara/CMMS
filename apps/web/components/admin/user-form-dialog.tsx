'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Role } from '@gmao/shared';
import type { UserDto } from '@gmao/shared';
import { usersApi } from '@/lib/users.api';
import { Mono } from '@/components/ui/mono';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const ROLE_COLOR: Record<Role, { color: string; bg: string }> = {
  [Role.SUPERVISOR]:  { color: 'var(--sb-role-supervisor)',  bg: 'var(--sb-role-supervisor-bg)' },
  [Role.STOREKEEPER]: { color: 'var(--sb-role-storekeeper)', bg: 'var(--sb-role-storekeeper-bg)' },
  [Role.TECHNICIAN]:  { color: 'var(--sb-role-technician)',  bg: 'var(--sb-role-technician-bg)' },
  [Role.ADMIN]:       { color: 'var(--sb-role-supervisor)',  bg: 'var(--sb-role-supervisor-bg)' },
  [Role.REQUESTER]:   { color: 'var(--sb-role-validator)',   bg: 'var(--sb-role-validator-bg)' },
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

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  roles: z.array(z.nativeEnum(Role)).min(1),
  hourlyRate: z.number().min(0).nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDto | null;
  onSuccess: () => void;
}

export function UserFormDialog({ open, onOpenChange, user, onSuccess }: UserFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!user;

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', roles: [], hourlyRate: null },
  });

  useEffect(() => {
    if (open) {
      reset(
        isEdit
          ? { name: user.name, email: user.email, roles: user.roles, hourlyRate: user.hourlyRate ?? null }
          : { name: '', email: '', roles: [], hourlyRate: null },
      );
    }
  }, [open, isEdit, user, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const selectedRoles = watch('roles');
  const showHourlyRate = selectedRoles.includes(Role.TECHNICIAN);

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => { toast.success(t('admin.users.form.createSuccess')); onSuccess(); },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(msg === 'users.emailAlreadyExists' ? t('admin.users.form.emailConflict') : t('admin.users.form.createError'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, hourlyRate }: { id: string; data: FormValues; hourlyRate: number | null | undefined }) =>
      usersApi.update(id, { name: data.name, email: data.email, roles: data.roles, ...(hourlyRate !== undefined ? { hourlyRate } : {}) }),
    onSuccess: () => { toast.success(t('admin.users.form.updateSuccess')); onSuccess(); },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(msg === 'users.emailAlreadyExists' ? t('admin.users.form.emailConflict') : t('admin.users.form.updateError'));
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: FormValues) => {
    const effectiveHourlyRate = data.roles.includes(Role.TECHNICIAN) ? (data.hourlyRate ?? undefined) : null;
    if (isEdit) {
      updateMutation.mutate({ id: user.id, data, hourlyRate: effectiveHourlyRate });
    } else {
      createMutation.mutate({ name: data.name, email: data.email, roles: data.roles, hourlyRate: effectiveHourlyRate ?? undefined });
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onOpenChange(false); }}
    >
      <div style={{ background: 'var(--sb-bg)', border: '1px solid var(--sb-border)', padding: 24, width: 440, maxHeight: '90vh', overflowY: 'auto' }}>

        { }
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em', marginBottom: 2 }}>
              {isEdit ? t('admin.users.form.editTitle') : t('admin.users.form.createTitle')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (!isPending) onOpenChange(false); }}
            disabled={isPending}
            style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.users.form.nameLabel')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input
              {...register('name')}
              style={inputS}
              placeholder={t('admin.users.form.namePlaceholder')}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.name ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.name && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('admin.users.form.nameRequired')}</Mono>
            )}
          </div>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('admin.users.form.emailLabel')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input
              {...register('email')}
              type="email"
              style={inputS}
              placeholder={t('admin.users.form.emailPlaceholder')}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = errors.email ? 'var(--sb-p-crit)' : 'var(--sb-border)'; }}
            />
            {errors.email && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 4 }}>{t('admin.users.form.emailInvalid')}</Mono>
            )}
          </div>

          { }
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 8 }}>
              {t('admin.users.form.rolesLabel')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <Controller
              control={control}
              name="roles"
              render={({ field }) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.values(Role).map((role) => {
                    const checked = field.value.includes(role);
                    const { color, bg } = ROLE_COLOR[role];
                    return (
                      <label
                        key={role}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px',
                          border: `1px solid ${checked ? `${color}55` : 'var(--sb-border)'}`,
                          background: checked ? bg : 'transparent',
                          cursor: 'pointer',
                          transition: 'border-color 0.1s, background 0.1s',
                        }}
                      >
                        <input
                          type="radio"
                          style={{ width: 12, height: 12, flexShrink: 0, cursor: 'pointer', accentColor: color }}
                          checked={checked}
                          onChange={() => field.onChange([role])}
                        />
                        <Mono size={9} color={checked ? color : 'var(--sb-text-secondary)'} tracking="0.10em" weight={checked ? 700 : 500}>
                          {t(`admin.users.roles.${role}`, { defaultValue: role })}
                        </Mono>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles && (
              <Mono size={8} color="var(--sb-p-crit)" block style={{ marginTop: 6 }}>{t('admin.users.form.rolesRequired')}</Mono>
            )}
          </div>

          {showHourlyRate && (
            <div>
              <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
                {t('admin.users.form.hourlyRateLabel')}
              </Mono>
              <input
                {...register('hourlyRate', { setValueAs: (v) => (v === '' || v === null ? null : parseFloat(v)) })}
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                style={{ ...inputS, fontFamily: MONO }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--sb-border)', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              style={{
                background: 'transparent',
                border: '1px solid var(--sb-border-strong)',
                borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                color: 'var(--sb-text-secondary)',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.5 : 1,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: isPending ? 'var(--sb-border)' : 'var(--sb-text-primary)',
                color: isPending ? 'var(--sb-text-tertiary)' : 'var(--sb-bg)',
                border: 'none', borderRadius: 2, padding: '6px 16px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
              {isEdit ? t('common.save') : t('common.create')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
