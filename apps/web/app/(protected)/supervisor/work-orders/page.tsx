'use client';

import { useTranslation } from 'react-i18next';
import { WorkOrdersBoard } from '@/components/supervisor/work-orders-board';

export default function SupervisorWorkOrdersPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('supervisorWorkOrders.title')}</h1>
        <p className="text-muted-foreground">{t('supervisorWorkOrders.subtitle')}</p>
      </div>

      <WorkOrdersBoard />
    </div>
  );
}
