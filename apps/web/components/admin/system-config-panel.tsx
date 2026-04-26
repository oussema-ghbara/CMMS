'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import type { SystemConfigEntry } from '@/lib/admin.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  SYSTEM_CONFIG_BOOLEAN_KEYS,
  SYSTEM_CONFIG_KEY_CONSTRAINTS,
  SYSTEM_CONFIG_GROUPS,
} from '@/lib/system-config-groups';

function ConfigRow({
  entry,
  label,
  description,
  onSave,
  isSaving,
}: {
  entry: SystemConfigEntry;
  label: string;
  description: string;
  onSave: (key: string, value: string) => void;
  isSaving: boolean;
}) {
  const [localValue, setLocalValue] = useState(entry.value);
  const isBoolean = SYSTEM_CONFIG_BOOLEAN_KEYS.has(entry.key);
  const constraints = SYSTEM_CONFIG_KEY_CONSTRAINTS[entry.key];
  const isDirty = localValue !== entry.value;

  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
            min={constraints?.min ?? 1}
            max={constraints?.max ?? 9999}
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
  const { t } = useTranslation();
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
      toast.success(t('admin.systemConfig.updateSuccess'));
      setSavingKey(null);
    },
    onError: () => {
      toast.error(t('admin.systemConfig.updateError'));
      setSavingKey(null);
    },
  });

  const handleSave = (key: string, value: string) => {
    setSavingKey(key);
    updateMutation.mutate({ key, value });
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configByKey = Object.fromEntries(configs.map((c) => [c.key, c]));
  const knownKeys = new Set(SYSTEM_CONFIG_GROUPS.flatMap((g) => g.keys));
  const unknownEntries = configs.filter((c) => !knownKeys.has(c.key));

  return (
    <div className="space-y-6 max-w-2xl">
      {SYSTEM_CONFIG_GROUPS.map((group) => {
        const groupEntries = group.keys
          .map((k) => configByKey[k])
          .filter((e): e is SystemConfigEntry => !!e);

        if (groupEntries.length === 0) return null;

        return (
          <Card key={group.titleKey}>
            <CardHeader>
              <CardTitle>{t(group.titleKey)}</CardTitle>
              {group.descriptionKey && (
                <CardDescription>{t(group.descriptionKey)}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {groupEntries.map((entry) => (
                <ConfigRow
                  key={entry.key}
                  entry={entry}
                  label={t(`admin.systemConfig.keys.${entry.key}.label`)}
                  description={t(`admin.systemConfig.keys.${entry.key}.description`)}
                  onSave={handleSave}
                  isSaving={savingKey === entry.key}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      {unknownEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.systemConfig.groups.other')}</CardTitle>
          </CardHeader>
          <CardContent>
            {unknownEntries.map((entry) => (
              <ConfigRow
                key={entry.key}
                entry={entry}
                label={entry.key}
                description=""
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
