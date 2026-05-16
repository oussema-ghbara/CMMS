'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mono } from '@/components/ui/mono';
import type { CategoryChecklistTemplateItem, ChecklistTaskType } from '@/lib/categories.api';

export type CategoryChecklistFormValues = {
  description: string;
  taskType: ChecklistTaskType;
  expectedCondition: string;
  isMandatory: boolean;
  autoCreateCorrectiveWO: boolean;
};

const TASK_TYPES: ChecklistTaskType[] = [
  'INSPECTION',
  'MEASUREMENT',
  'LUBRICATION',
  'CLEANING',
  'REPLACEMENT',
  'CALIBRATION',
  'ADJUSTMENT',
];

const inputS: React.CSSProperties = {
  display: 'block', width: '100%', height: 32, padding: '0 10px',
  border: '1px solid var(--sb-border)', borderRadius: 2,
  fontSize: 13, color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
  outline: 'none', boxSizing: 'border-box',
};

const selectS: React.CSSProperties = {
  display: 'block', width: '100%', height: 32, padding: '0 4px 0 10px',
  border: '1px solid var(--sb-border)', borderRadius: 2,
  fontSize: 13, color: 'var(--sb-text-primary)', background: 'var(--sb-bg)',
  cursor: 'pointer', outline: 'none', boxSizing: 'border-box',
};

interface CategoryChecklistItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CategoryChecklistTemplateItem | null;
  onSubmit: (values: CategoryChecklistFormValues) => void;
}

export function CategoryChecklistItemDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
}: CategoryChecklistItemDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!item;

  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<ChecklistTaskType>('INSPECTION');
  const [expectedCondition, setExpectedCondition] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [autoCreateCorrectiveWO, setAutoCreateCorrectiveWO] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescription(item?.description ?? '');
    setTaskType(item?.taskType ?? 'INSPECTION');
    setExpectedCondition(item?.expectedCondition ?? '');
    setIsMandatory(item?.isMandatory ?? false);
    setAutoCreateCorrectiveWO(item?.autoCreateCorrectiveWO ?? false);
  }, [item, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const handleSubmit = () => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast.error(t('supervisorCategories.checklist.validation.descriptionRequired'));
      return;
    }
    onSubmit({
      description: trimmedDescription,
      taskType,
      expectedCondition: expectedCondition.trim(),
      isMandatory,
      autoCreateCorrectiveWO,
    });
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10002,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div style={{
        background: 'var(--sb-bg)',
        border: '1px solid var(--sb-border)',
        padding: 24,
        width: 500,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em' }}>
              {isEdit ? t('supervisorCategories.checklist.editTitle') : t('supervisorCategories.checklist.addTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)', marginTop: 3 }}>
              {isEdit ? t('supervisorCategories.checklist.editDescription') : t('supervisorCategories.checklist.addDescription')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{ background: 'transparent', border: '1px solid var(--sb-border)', padding: '3px 8px', cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}
          >
            <Mono size={8} color="var(--sb-text-tertiary)">✕</Mono>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorCategories.checklist.fields.description')} <span style={{ color: 'var(--sb-p-crit)' }}>*</span>
            </Mono>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorCategories.checklist.fields.taskType')}
            </Mono>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as ChecklistTaskType)}
              style={selectS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`supervisorCategories.taskType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Mono size={8} color="var(--sb-text-tertiary)" block style={{ marginBottom: 5 }}>
              {t('supervisorCategories.checklist.fields.expectedCondition')}
            </Mono>
            <input
              value={expectedCondition}
              onChange={(e) => setExpectedCondition(e.target.value)}
              maxLength={200}
              style={inputS}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border-strong)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--sb-border)'; }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--sb-text-primary)' }}
              />
              <span style={{ fontSize: 13, color: 'var(--sb-text-primary)' }}>
                {t('supervisorCategories.checklist.fields.isMandatory')}
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoCreateCorrectiveWO}
                onChange={(e) => setAutoCreateCorrectiveWO(e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--sb-text-primary)' }}
              />
              <span style={{ fontSize: 13, color: 'var(--sb-text-primary)' }}>
                {t('supervisorCategories.checklist.fields.autoCreateCorrectiveWO')}
              </span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--sb-border)' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--sb-border)', cursor: 'pointer', fontSize: 12, color: 'var(--sb-text-secondary)', borderRadius: 2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sb-surface)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{ padding: '6px 14px', background: 'var(--sb-text-primary)', border: '1px solid var(--sb-text-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--sb-bg)', fontWeight: 600, borderRadius: 2 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {isEdit ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
