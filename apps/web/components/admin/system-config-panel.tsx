'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import type { SystemConfigEntry } from '@/lib/admin.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const BOOLEAN_KEYS = new Set([
  'PASSWORD_REQUIRE_UPPERCASE',
  'PASSWORD_REQUIRE_NUMBER',
  'PASSWORD_REQUIRE_SPECIAL',
]);

const KEY_LABELS: Record<string, { label: string; description: string }> = {
  PASSWORD_MIN_LENGTH: {
    label: 'Longueur minimale du mot de passe',
    description: 'Nombre minimum de caractères requis',
  },
  PASSWORD_REQUIRE_UPPERCASE: {
    label: 'Majuscule obligatoire',
    description: 'Le mot de passe doit contenir au moins une lettre majuscule',
  },
  PASSWORD_REQUIRE_NUMBER: {
    label: 'Chiffre obligatoire',
    description: 'Le mot de passe doit contenir au moins un chiffre',
  },
  PASSWORD_REQUIRE_SPECIAL: {
    label: 'Caractère spécial obligatoire',
    description: 'Le mot de passe doit contenir au moins un caractère spécial',
  },
};

function ConfigRow({
  entry,
  onSave,
  isSaving,
}: {
  entry: SystemConfigEntry;
  onSave: (key: string, value: string) => void;
  isSaving: boolean;
}) {
  const [localValue, setLocalValue] = useState(entry.value);
  const isBoolean = BOOLEAN_KEYS.has(entry.key);
  const meta = KEY_LABELS[entry.key];
  const isDirty = localValue !== entry.value;

  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{meta?.label ?? entry.key}</p>
        {meta?.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isBoolean ? (
          <button
            type="button"
            role="switch"
            aria-checked={localValue === 'true'}
            onClick={() => setLocalValue(localValue === 'true' ? 'false' : 'true')}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              localValue === 'true' ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                localValue === 'true' ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        ) : (
          <Input
            type="number"
            min={1}
            max={128}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            className="w-24 h-8 text-sm"
          />
        )}
        <Button
          size="sm"
          variant={isDirty ? 'default' : 'ghost'}
          disabled={!isDirty || isSaving}
          onClick={() => onSave(entry.key, localValue)}
          className="h-8 px-2"
          title="Enregistrer"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function SystemConfigPanel() {
  const queryClient = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['admin', 'system-config'],
    queryFn: adminApi.getSystemConfig,
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      adminApi.updateSystemConfig(key, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'system-config'] });
      toast.success('Configuration mise à jour');
      setSavingKey(null);
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
      setSavingKey(null);
    },
  });

  const handleSave = (key: string, value: string) => {
    setSavingKey(key);
    updateMutation.mutate({ key, value });
  };

  // Only show known password policy keys in order
  const orderedKeys = [
    'PASSWORD_MIN_LENGTH',
    'PASSWORD_REQUIRE_UPPERCASE',
    'PASSWORD_REQUIRE_NUMBER',
    'PASSWORD_REQUIRE_SPECIAL',
  ];

  const policyEntries = orderedKeys
    .map((k) => configs.find((c) => c.key === k))
    .filter((e): e is SystemConfigEntry => !!e);

  const otherEntries = configs.filter((c) => !orderedKeys.includes(c.key));

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Politique de mot de passe</CardTitle>
          <CardDescription>
            Règles appliquées lors de la création ou du changement de mot de passe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune configuration trouvée. Exécutez le script de seed.
            </p>
          ) : (
            policyEntries.map((entry) => (
              <ConfigRow
                key={entry.key}
                entry={entry}
                onSave={handleSave}
                isSaving={savingKey === entry.key}
              />
            ))
          )}
        </CardContent>
      </Card>

      {otherEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Autres paramètres</CardTitle>
          </CardHeader>
          <CardContent>
            {otherEntries.map((entry) => (
              <ConfigRow
                key={entry.key}
                entry={entry}
                onSave={handleSave}
                isSaving={savingKey === entry.key}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
