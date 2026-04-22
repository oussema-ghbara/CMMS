'use client';

import { useTranslation } from 'react-i18next';
import { ValidationQueueBoard } from '@/components/supervisor/validation-queue-board';

export default function ValidationQueuePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('validationQueue.title')}</h1>
        <p className="text-muted-foreground">{t('validationQueue.subtitle')}</p>
      </div>

      <ValidationQueueBoard />
    </div>
  );
}
