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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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
          ? {
            name: user.name,
            email: user.email,
            roles: user.roles,
            hourlyRate: user.hourlyRate ?? null,
          }
          : { name: '', email: '', roles: [], hourlyRate: null },
      );
    }
  }, [open, isEdit, user, reset]);

  const selectedRoles = watch('roles');
  const showHourlyRate = selectedRoles.includes(Role.TECHNICIAN);

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      toast.success(t('admin.users.form.createSuccess'));
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(
        msg === 'users.emailAlreadyExists'
          ? t('admin.users.form.emailConflict')
          : t('admin.users.form.createError'),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, hourlyRate }: { id: string; data: FormValues; hourlyRate: number | null | undefined }) =>
      usersApi.update(id, {
        name: data.name,
        email: data.email,
        roles: data.roles,
        ...(hourlyRate !== undefined ? { hourlyRate } : {}),
      }),
    onSuccess: () => {
      toast.success(t('admin.users.form.updateSuccess'));
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(
        msg === 'users.emailAlreadyExists'
          ? t('admin.users.form.emailConflict')
          : t('admin.users.form.updateError'),
      );
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: FormValues) => {
    const effectiveHourlyRate = data.roles.includes(Role.TECHNICIAN)
      ? (data.hourlyRate ?? undefined)
      : null;

    if (isEdit) {
      updateMutation.mutate({ id: user.id, data, hourlyRate: effectiveHourlyRate });
    } else {
      createMutation.mutate({
        name: data.name,
        email: data.email,
        roles: data.roles,
        hourlyRate: effectiveHourlyRate ?? undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('admin.users.form.editTitle') : t('admin.users.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">{t('admin.users.form.nameLabel')}</Label>
            <Input id="name" {...register('name')} placeholder={t('admin.users.form.namePlaceholder')} />
            {errors.name && (
              <p className="text-xs text-destructive">{t('admin.users.form.nameRequired')}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('admin.users.form.emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder={t('admin.users.form.emailPlaceholder')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{t('admin.users.form.emailInvalid')}</p>
            )}
          </div>

          {/* Roles */}
          <div className="space-y-1.5">
            <Label>{t('admin.users.form.rolesLabel')}</Label>
            <Controller
              control={control}
              name="roles"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(Role).map((role) => {
                    const checked = field.value.includes(role);
                    return (
                      <label
                        key={role}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                          checked
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-input hover:bg-muted',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              field.onChange([...field.value, role]);
                            } else {
                              field.onChange(field.value.filter((r) => r !== role));
                            }
                          }}
                        />
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                        >
                          {checked && (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </span>
                        {t(`admin.users.roles.${role}`, { defaultValue: role })}
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles && (
              <p className="text-xs text-destructive">{t('admin.users.form.rolesRequired')}</p>
            )}
          </div>

          {/* Hourly rate (Technician only) */}
          {showHourlyRate && (
            <div className="space-y-1.5">
              <Label htmlFor="hourlyRate">{t('admin.users.form.hourlyRateLabel')}</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                {...register('hourlyRate', {
                  setValueAs: (v) => (v === '' || v === null ? null : parseFloat(v)),
                })}
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
