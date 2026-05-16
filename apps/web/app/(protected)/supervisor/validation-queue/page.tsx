import { ValidationQueueBoard } from '@/components/supervisor/validation-queue-board';

export default function ValidationQueuePage() {
  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 74px)' }}>
      <ValidationQueueBoard />
    </div>
  );
}
