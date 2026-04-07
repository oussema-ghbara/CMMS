'use client';

import { useTranslation } from 'react-i18next';
import { PartRequestsQueue } from '@/components/storekeeper/part-requests-queue';

export default function StorekeeperPartRequestsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('storekeeperPartRequests.title')}</h1>
        <p className="text-muted-foreground">{t('storekeeperPartRequests.subtitle')}</p>
      </div>

      <PartRequestsQueue />
    </div>
  );
}
