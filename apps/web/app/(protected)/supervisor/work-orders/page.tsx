import { Suspense } from 'react';
import { WorkOrdersBoard } from '@/components/supervisor/work-orders-board';

export default function SupervisorWorkOrdersPage() {
  return (

    <div style={{ margin: '-24px', height: 'calc(100vh - 74px)' }}>
      <Suspense>
        <WorkOrdersBoard />
      </Suspense>
    </div>
  );
}
