'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChecklistTaskType, PreventivePlanChecklistItem } from '@/lib/preventive-plans.api';

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

export function PreventivePlanChecklistItemDialog({ open, onOpenChange, item, onSubmit }: PreventivePlanChecklistItemDialogProps) {
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

  const handleSubmit = () => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast.error(t('supervisorPreventivePlans.validation.checklistDescriptionRequired'));
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setDescription('');
          setExpectedCondition('');
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('supervisorPreventivePlans.checklist.editTitle') : t('supervisorPreventivePlans.checklist.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('supervisorPreventivePlans.checklist.editDescription')
              : t('supervisorPreventivePlans.checklist.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="checklist-description">{t('supervisorPreventivePlans.checklist.fields.description')}</Label>
            <Input id="checklist-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="checklist-task-type">{t('supervisorPreventivePlans.checklist.fields.taskType')}</Label>
            <select
              id="checklist-task-type"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as ChecklistTaskType)}
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`supervisorPreventivePlans.taskType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="checklist-expected-condition">
              {t('supervisorPreventivePlans.checklist.fields.expectedCondition')}
            </Label>
            <Input
              id="checklist-expected-condition"
              value={expectedCondition}
              onChange={(e) => setExpectedCondition(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
            {t('supervisorPreventivePlans.checklist.fields.isMandatory')}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoCreateCorrectiveWO}
              onChange={(e) => setAutoCreateCorrectiveWO(e.target.checked)}
            />
            {t('supervisorPreventivePlans.checklist.fields.autoCreateCorrectiveWO')}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEdit ? t('common.save') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}