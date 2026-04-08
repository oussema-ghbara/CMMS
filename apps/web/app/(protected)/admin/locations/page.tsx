'use client';

import { useTranslation } from 'react-i18next';
import { LocationsTable } from '@/components/admin/locations-table';

export default function AdminLocationsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.locations.title')}</h1>
        <p className="text-muted-foreground">{t('admin.locations.subtitle')}</p>
      </div>
      <LocationsTable />
    </div>
  );
}
