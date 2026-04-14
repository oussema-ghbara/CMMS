'use client';

import { useTranslation } from 'react-i18next';
import { SupervisorAnalyticsBoard } from '@/components/supervisor/supervisor-analytics-board';

export default function SupervisorAnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorAnalytics.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorAnalytics.subtitle')}</p>
      </div>

      <SupervisorAnalyticsBoard />
    </div>
  );
}
