import { Suspense } from 'react';
import { TechnicianWorkOrdersBoard } from '@/components/technician/technician-work-orders-board';

export default function TechnicianWorkOrdersPage() {
  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 74px)' }}>
      <Suspense>
        <TechnicianWorkOrdersBoard />
      </Suspense>
    </div>
  );
}
