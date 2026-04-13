'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const selectClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

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
            {isEdit
              ? t('supervisorCategories.checklist.editTitle')
              : t('supervisorCategories.checklist.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('supervisorCategories.checklist.editDescription')
              : t('supervisorCategories.checklist.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-checklist-description">
              {t('supervisorCategories.checklist.fields.description')}
            </Label>
            <Input
              id="cat-checklist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-checklist-task-type">
              {t('supervisorCategories.checklist.fields.taskType')}
            </Label>
            <select
              id="cat-checklist-task-type"
              className={selectClass}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as ChecklistTaskType)}
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`supervisorCategories.taskType.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-checklist-expected-condition">
              {t('supervisorCategories.checklist.fields.expectedCondition')}
            </Label>
            <Input
              id="cat-checklist-expected-condition"
              value={expectedCondition}
              onChange={(e) => setExpectedCondition(e.target.value)}
              maxLength={200}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
            />
            {t('supervisorCategories.checklist.fields.isMandatory')}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoCreateCorrectiveWO}
              onChange={(e) => setAutoCreateCorrectiveWO(e.target.checked)}
            />
            {t('supervisorCategories.checklist.fields.autoCreateCorrectiveWO')}
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
