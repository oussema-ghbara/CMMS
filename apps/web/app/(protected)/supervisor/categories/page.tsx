'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, ListChecks, Tags } from 'lucide-react';
import { categoriesApi, type CategoryItem } from '@/lib/categories.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CategoryChecklistDialog } from '@/components/supervisor/category-checklist-dialog';

export default function SupervisorCategoriesPage() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);

  const { data: categories = [], isLoading, isError } = useQuery({
    queryKey: ['supervisor', 'categories'],
    queryFn: () => categoriesApi.list(),
  });

  const openChecklist = (category: CategoryItem) => {
    setSelectedCategory(category);
    setChecklistDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('supervisorCategories.title')}</h1>
          <p className="text-muted-foreground">{t('supervisorCategories.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tags className="h-4 w-4" />
          {!isLoading && (
            <span>{t('supervisorCategories.total', { count: categories.length })}</span>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('supervisorCategories.columns.name')}</TableHead>
              <TableHead>{t('supervisorCategories.columns.description')}</TableHead>
              <TableHead>{t('supervisorCategories.columns.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-destructive">
                  {t('supervisorCategories.states.error')}
                </TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  {t('supervisorCategories.states.empty')}
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {category.description ?? t('supervisorCategories.labels.noDescription')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? 'success' : 'destructive'}>
                      {category.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openChecklist(category)}
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      {t('supervisorCategories.actions.manageChecklist')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={(open) => {
          setChecklistDialogOpen(open);
          if (!open) setSelectedCategory(null);
        }}
        category={selectedCategory}
      />
    </div>
  );
}
