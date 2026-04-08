'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
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

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Administrateur',
  [Role.SUPERVISOR]: 'Superviseur',
  [Role.TECHNICIAN]: 'Technicien',
  [Role.STOREKEEPER]: 'Magasinier',
  [Role.REQUESTER]: 'Demandeur',
};

const schema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  email: z.string().email('Email invalide'),
  roles: z.array(z.nativeEnum(Role)).min(1, 'Au moins un rôle est requis'),
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
      toast.success('Utilisateur créé — un email de configuration a été envoyé');
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(
        msg === 'users.emailAlreadyExists' ? 'Cet email est déjà utilisé' : 'Erreur lors de la création',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormValues }) =>
      usersApi.update(id, {
        name: data.name,
        email: data.email,
        roles: data.roles,
        hourlyRate: data.hourlyRate ?? undefined,
      }),
    onSuccess: () => {
      toast.success('Utilisateur mis à jour');
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message;
      toast.error(
        msg === 'users.emailAlreadyExists' ? 'Cet email est déjà utilisé' : 'Erreur lors de la mise à jour',
      );
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateMutation.mutate({ id: user.id, data });
    } else {
      createMutation.mutate({
        name: data.name,
        email: data.email,
        roles: data.roles,
        hourlyRate: data.hourlyRate ?? undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom complet</Label>
            <Input id="name" {...register('name')} placeholder="Jean Dupont" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="jean.dupont@gmao.local"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Roles */}
          <div className="space-y-1.5">
            <Label>Rôles</Label>
            <Controller
              control={control}
              name="roles"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => {
                    const checked = field.value.includes(role as Role);
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
                              field.onChange([...field.value, role as Role]);
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
                        {label}
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles && (
              <p className="text-xs text-destructive">{errors.roles.message}</p>
            )}
          </div>

          {/* Hourly rate (Technician only) */}
          {showHourlyRate && (
            <div className="space-y-1.5">
              <Label htmlFor="hourlyRate">Taux horaire (€/h)</Label>
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
              {errors.hourlyRate && (
                <p className="text-xs text-destructive">{errors.hourlyRate.message}</p>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
