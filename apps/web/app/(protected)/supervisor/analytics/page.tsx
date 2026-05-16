'use client';

import { useTranslation } from 'react-i18next';
import { SupervisorAnalyticsBoard } from '@/components/supervisor/supervisor-analytics-board';
import { Mono } from '@/components/ui/mono';

export default function SupervisorAnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Mono size={10} color="var(--sb-text-tertiary)" tracking="0.15em" block>
          {t('supervisorAnalytics.title')}
        </Mono>
        <div style={{ fontSize: 13, color: 'var(--sb-text-secondary)', marginTop: 3 }}>
          {t('supervisorAnalytics.subtitle')}
        </div>
      </div>

      <SupervisorAnalyticsBoard />
    </div>
  );
}
