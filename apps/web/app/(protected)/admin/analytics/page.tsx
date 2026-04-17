'use client';

import { useTranslation } from 'react-i18next';
import { AdminAnalyticsBoard } from '@/components/admin/admin-analytics-board';

export default function AdminAnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('adminAnalytics.title')}</h1>
        <p className="text-muted-foreground">{t('adminAnalytics.subtitle')}</p>
      </div>

      <AdminAnalyticsBoard />
    </div>
  );
}
