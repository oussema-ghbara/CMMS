'use client';

import { useTranslation } from 'react-i18next';
import { AuditLogTable } from '@/components/admin/audit-log-table';

export default function AuditLogPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.auditLog.title')}</h1>
        <p className="text-muted-foreground">{t('admin.auditLog.subtitle')}</p>
      </div>
      <AuditLogTable />
    </div>
  );
}
