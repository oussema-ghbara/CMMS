'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  FormDialog,
  CANCEL_BTN_STYLE,
  DIALOG_SELECT_STYLE,
  DIALOG_FOOTER_STYLE,
} from '@/components/ui/form-dialog';
import type { ChecklistTaskType, PreventivePlanChecklistItem } from '@/lib/preventive-plans.api';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

export type ChecklistFormValues = {
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

interface PreventivePlanChecklistItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PreventivePlanChecklistItem | null;
  onSubmit: (values: ChecklistFormValues) => void;
}

function BooleanRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        background: checked ? 'var(--sb-s-done-bg)' : 'var(--sb-surface)',
        border: `1px solid ${checked ? 'var(--sb-s-done)' : 'var(--sb-border)'}`,
        borderRadius: 2,
        padding: '9px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1.5px solid ${checked ? 'var(--sb-s-done)' : 'var(--sb-border-strong)'}`,
          background: checked ? 'var(--sb-s-done)' : 'transparent',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.1s',
        }}
      >
        {checked && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--sb-text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
        {label}
      </span>
    </button>
  );
}

export function PreventivePlanChecklistItemDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
}: PreventivePlanChecklistItemDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!item;

  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<ChecklistTaskType>('INSPECTION');
  const [expectedCondition, setExpectedCondition] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [autoCreateCorrectiveWO, setAutoCreateCorrectiveWO] = useState(false);
  const [descError, setDescError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescription(item?.description ?? '');
    setTaskType(item?.taskType ?? 'INSPECTION');
    setExpectedCondition(item?.expectedCondition ?? '');
    setIsMandatory(item?.isMandatory ?? false);
    setAutoCreateCorrectiveWO(item?.autoCreateCorrectiveWO ?? false);
    setDescError(false);
  }, [item, open]);

  const handleClose = () => {
    onOpenChange(false);
    setDescription('');
    setExpectedCondition('');
    setDescError(false);
  };

  const handleSubmit = () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setDescError(true);
      toast.error(t('supervisorPreventivePlans.validation.checklistDescriptionRequired'));
      return;
    }
    onSubmit({
      description: trimmed,
      taskType,
      expectedCondition: expectedCondition.trim(),
      isMandatory,
      autoCreateCorrectiveWO,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      title={isEdit ? t('supervisorPreventivePlans.checklist.editTitle') : t('supervisorPreventivePlans.checklist.addTitle')}
      description={isEdit ? t('supervisorPreventivePlans.checklist.editDescription') : t('supervisorPreventivePlans.checklist.addDescription')}
      maxWidth={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField
          label={t('supervisorPreventivePlans.checklist.fields.description')}
          htmlFor="checklist-description"
          required
          error={descError ? t('common.required') : undefined}
        >
          <Input
            id="checklist-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (e.target.value.trim()) setDescError(false);
            }}
          />
        </FormField>

        <FormField
          label={t('supervisorPreventivePlans.checklist.fields.taskType')}
          htmlFor="checklist-task-type"
        >
          <select
            id="checklist-task-type"
            style={DIALOG_SELECT_STYLE}
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as ChecklistTaskType)}
          >
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`supervisorPreventivePlans.taskType.${type}`)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label={t('supervisorPreventivePlans.checklist.fields.expectedCondition')}
          htmlFor="checklist-expected-condition"
        >
          <Input
            id="checklist-expected-condition"
            value={expectedCondition}
            onChange={(e) => setExpectedCondition(e.target.value)}
          />
        </FormField>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <BooleanRow
            checked={isMandatory}
            onChange={setIsMandatory}
            label={t('supervisorPreventivePlans.checklist.fields.isMandatory')}
          />
          <BooleanRow
            checked={autoCreateCorrectiveWO}
            onChange={setAutoCreateCorrectiveWO}
            label={t('supervisorPreventivePlans.checklist.fields.autoCreateCorrectiveWO')}
          />
        </div>

        <div style={DIALOG_FOOTER_STYLE}>
          <button type="button" onClick={handleClose} style={CANCEL_BTN_STYLE(false)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--sb-text-primary)',
              color: 'var(--sb-bg)',
              border: 'none',
              borderRadius: 2,
              padding: '6px 16px',
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isEdit ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
    </FormDialog>
  );
}
