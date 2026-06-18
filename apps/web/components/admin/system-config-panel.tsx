'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { adminApi } from '@/lib/admin.api';
import type { SystemConfigEntry } from '@/lib/admin.api';
import { Mono } from '@/components/ui/mono';
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
  const isOn = localValue === 'true';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 24,
      padding: '11px 14px',
      borderBottom: '1px solid var(--sb-border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)', marginBottom: description ? 2 : 0 }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', lineHeight: 1.5 }}>
            {description}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isBoolean ? (
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            onClick={() => setLocalValue(isOn ? 'false' : 'true')}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              width: 40,
              height: 22,
              borderRadius: 11,
              background: isOn ? '#2E7A4E' : 'var(--sb-border-strong)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transform: isOn ? 'translateX(21px)' : 'translateX(3px)',
              transition: 'transform 0.15s',
            }} />
          </button>
        ) : (
          <input
            type="number"
            min={constraints?.min ?? 1}
            max={constraints?.max ?? 9999}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            style={{
              width: 88,
              height: 28,
              padding: '0 8px',
              border: '1px solid var(--sb-border)',
              borderRadius: 2,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontSize: 12,
              color: 'var(--sb-text-primary)',
              background: 'var(--sb-bg)',
              outline: 'none',
              textAlign: 'right',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
          />
        )}

        <button
          type="button"
          disabled={!isDirty || isSaving}
          onClick={() => onSave(entry.key, localValue)}
          title={isDirty ? 'Enregistrer' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            border: `1px solid ${isDirty ? 'var(--sb-border-strong)' : 'var(--sb-border)'}`,
            borderRadius: 2,
            background: isDirty ? 'var(--sb-text-primary)' : 'transparent',
            color: isDirty ? 'var(--sb-bg)' : 'var(--sb-text-tertiary)',
            cursor: !isDirty || isSaving ? 'not-allowed' : 'pointer',
            opacity: !isDirty && !isSaving ? 0.4 : 1,
            transition: 'all 0.12s',
            padding: 0,
            flexShrink: 0,
          }}
        >
          {isSaving
            ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
            : <Save style={{ width: 12, height: 12 }} />
          }
        </button>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
        <Loader2 style={{ width: 22, height: 22, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const configByKey = Object.fromEntries(configs.map((c) => [c.key, c]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      {SYSTEM_CONFIG_GROUPS.map((group) => {
        const groupEntries = group.keys
          .map((k) => configByKey[k])
          .filter((e): e is SystemConfigEntry => !!e);

        if (groupEntries.length === 0) return null;

        return (
          <div key={group.titleKey} style={{ border: '1px solid var(--sb-border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ background: 'var(--sb-surface)', borderBottom: '1px solid var(--sb-border)', padding: '8px 14px' }}>
              <Mono size={10} color="var(--sb-text-secondary)" tracking="0.13em">
                {t(group.titleKey).toUpperCase()}
              </Mono>
              {group.descriptionKey && (
                <div style={{ fontSize: 11, color: 'var(--sb-text-tertiary)', marginTop: 2 }}>
                  {t(group.descriptionKey)}
                </div>
              )}
            </div>
            <div>
              {groupEntries.map((entry, i) => (
                <div key={entry.key} style={i === groupEntries.length - 1 ? { borderBottom: 'none' } : undefined}>
                  <ConfigRow
                    entry={entry}
                    label={t(`admin.systemConfig.keys.${entry.key}.label`)}
                    description={t(`admin.systemConfig.keys.${entry.key}.description`)}
                    onSave={handleSave}
                    isSaving={savingKey === entry.key}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
