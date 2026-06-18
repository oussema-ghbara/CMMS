'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { categoriesApi, type CategoryItem } from '@/lib/categories.api';
import { Mono } from '@/components/ui/mono';
import { CategoryChecklistDialog } from '@/components/supervisor/category-checklist-dialog';

const COL = '1fr 2fr 100px 140px';

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '0 14px' }}>
      <Mono size={9} color="var(--sb-text-tertiary)">{children}</Mono>
    </div>
  );
}

function CategoryRow({
  category,
  onOpenChecklist,
}: {
  category: CategoryItem;
  onOpenChecklist: (category: CategoryItem) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COL,
        alignItems: 'center',
        borderBottom: '1px solid var(--sb-border)',
        background: hovered ? 'var(--sb-surface)' : 'transparent',
        minHeight: 44,
        transition: 'background 80ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ padding: '10px 14px' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sb-text-primary)' }}>
          {category.name}
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <span style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>
          {category.description ?? <span style={{ color: 'var(--sb-text-tertiary)' }}>—</span>}
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: category.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)',
          }} />
          <Mono size={9} color={category.isActive ? 'var(--sb-s-done)' : 'var(--sb-text-tertiary)'}>
            {category.isActive ? t('common.active').toUpperCase() : t('common.inactive').toUpperCase()}
          </Mono>
        </span>
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onOpenChecklist(category)}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--sb-border)',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--sb-text-secondary)',
            borderRadius: 2,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--sb-hover)';
            e.currentTarget.style.borderColor = 'var(--sb-border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--sb-border)';
          }}
        >
          {t('supervisorCategories.actions.manageChecklist')}
        </button>
      </div>
    </div>
  );
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      { }
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--sb-text-primary)', letterSpacing: '-0.01em', marginBottom: 3 }}>
            {t('supervisorCategories.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sb-text-secondary)' }}>
            {t('supervisorCategories.subtitle')}
          </div>
        </div>
        {!isLoading && categories.length > 0 && (
          <Mono size={10} color="var(--sb-text-tertiary)">
            {t('supervisorCategories.total', { count: categories.length })}
          </Mono>
        )}
      </div>

      { }
      <div style={{ border: '1px solid var(--sb-border)', background: 'white' }}>
        { }
        <div style={{
          display: 'grid',
          gridTemplateColumns: COL,
          height: 32,
          background: 'var(--sb-surface)',
          borderBottom: '1px solid var(--sb-border)',
          alignItems: 'center',
        }}>
          <HeaderCell>{t('supervisorCategories.columns.name').toUpperCase()}</HeaderCell>
          <HeaderCell>{t('supervisorCategories.columns.description').toUpperCase()}</HeaderCell>
          <HeaderCell>{t('supervisorCategories.columns.status').toUpperCase()}</HeaderCell>
          <div />
        </div>

        { }
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
            <Loader2 style={{ width: 20, height: 20, color: 'var(--sb-text-tertiary)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
            <Mono size={10} color="var(--sb-p-crit)">{t('supervisorCategories.states.error').toUpperCase()}</Mono>
          </div>
        ) : categories.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
            <Mono size={10} color="var(--sb-text-tertiary)">{t('supervisorCategories.states.empty').toUpperCase()}</Mono>
          </div>
        ) : (
          categories.map((category) => (
            <CategoryRow key={category.id} category={category} onOpenChecklist={openChecklist} />
          ))
        )}

        { }
        {!isLoading && !isError && categories.length > 0 && (
          <div style={{ height: 32, background: 'var(--sb-surface)', borderTop: '1px solid var(--sb-border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sb-s-done)' }} />
              <Mono size={8} color="var(--sb-text-tertiary)">
                {categories.filter((c) => c.isActive).length} {t('common.active').toUpperCase()}
              </Mono>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sb-text-tertiary)' }} />
              <Mono size={8} color="var(--sb-text-tertiary)">
                {categories.filter((c) => !c.isActive).length} {t('common.inactive').toUpperCase()}
              </Mono>
            </span>
          </div>
        )}
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
