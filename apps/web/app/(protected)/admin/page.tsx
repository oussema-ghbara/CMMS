'use client';

import { useTranslation } from 'react-i18next';
import { UsersTable } from '@/components/admin/users-table';

export default function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.users.title')}</h1>
        <p className="text-muted-foreground">{t('admin.users.subtitle')}</p>
      </div>
      <UsersTable />
    </div>
  );
}
