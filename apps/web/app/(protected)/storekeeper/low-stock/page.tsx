'use client';

import { useTranslation } from 'react-i18next';
import { LowStockView } from '@/components/storekeeper/low-stock-view';

export default function LowStockPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('storekeeperLowStock.title')}</h1>
        <p className="text-muted-foreground">{t('storekeeperLowStock.subtitle')}</p>
      </div>

      <LowStockView />
    </div>
  );
}
