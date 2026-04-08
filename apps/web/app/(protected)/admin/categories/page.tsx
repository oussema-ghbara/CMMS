'use client';

import { useTranslation } from 'react-i18next';
import { CategoriesTable } from '@/components/admin/categories-table';

export default function AdminCategoriesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.categories.title')}</h1>
        <p className="text-muted-foreground">{t('admin.categories.subtitle')}</p>
      </div>
      <CategoriesTable />
    </div>
  );
}
