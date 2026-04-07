'use client';

import { useTranslation } from 'react-i18next';
import { ReportsBoard } from '@/components/supervisor/reports-board';

export default function SupervisorReportsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorReports.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorReports.subtitle')}</p>
      </div>

      <ReportsBoard />
    </div>
  );
}