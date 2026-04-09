'use client';

import { useTranslation } from 'react-i18next';
import { AssetsBoard } from '@/components/supervisor/assets-board';

export default function SupervisorAssetsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorAssets.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorAssets.subtitle')}</p>
      </div>
      <AssetsBoard />
    </div>
  );
}
