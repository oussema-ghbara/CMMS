'use client';

import { useTranslation } from 'react-i18next';
import { PreventivePlansBoard } from '@/components/supervisor/preventive-plans-board';

export default function SupervisorPreventivePlansPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorPreventivePlans.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorPreventivePlans.subtitle')}</p>
      </div>

      <PreventivePlansBoard />
    </div>
  );
}