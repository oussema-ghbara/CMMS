'use client';

import { useTranslation } from 'react-i18next';
import { SystemConfigPanel } from '@/components/admin/system-config-panel';

export default function SystemConfigPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.systemConfig.title')}</h1>
        <p className="text-muted-foreground">{t('admin.systemConfig.subtitle')}</p>
      </div>
      <SystemConfigPanel />
    </div>
  );
}
