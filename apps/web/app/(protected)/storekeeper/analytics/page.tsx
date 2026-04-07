'use client';

import { useTranslation } from 'react-i18next';
import { StockAnalyticsBoard } from '@/components/storekeeper/stock-analytics-board';

export default function StorekeeperAnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('storekeeperAnalytics.title')}</h1>
        <p className="text-muted-foreground">{t('storekeeperAnalytics.subtitle')}</p>
      </div>

      <StockAnalyticsBoard />
    </div>
  );
}
