import { Suspense } from 'react';
import { WorkOrdersBoard } from '@/components/supervisor/work-orders-board';

export default function SupervisorWorkOrdersPage() {
  return (
    // Negative margin cancels AppShell main's 24px padding so the board fills
    // the full chrome-free height (100vh - 34px rail - 40px module-bar = 74px total).
    <div style={{ margin: '-24px', height: 'calc(100vh - 74px)' }}>
      <Suspense>
        <WorkOrdersBoard />
      </Suspense>
    </div>
  );
}
