import { WorkOrderPriority } from '@gmao/shared';
import { Mono } from './mono';

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'var(--sb-p-crit)',
  [WorkOrderPriority.HIGH]:     'var(--sb-p-high)',
  [WorkOrderPriority.MEDIUM]:   'var(--sb-p-norm)',
  [WorkOrderPriority.LOW]:      'var(--sb-p-low)',
};

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  [WorkOrderPriority.CRITICAL]: 'CRITIQUE',
  [WorkOrderPriority.HIGH]:     'HAUTE',
  [WorkOrderPriority.MEDIUM]:   'NORMALE',
  [WorkOrderPriority.LOW]:      'BASSE',
};

interface PriorityChipProps {
  priority: WorkOrderPriority;
}

export function PriorityChip({ priority }: PriorityChipProps) {
  const color = PRIORITY_COLOR[priority];
  const label = PRIORITY_LABEL[priority];

  return (
    <span
      style={{
        display: 'inline-block',
        background: `${color}11`,
        borderLeft: `2px solid ${color}`,
        padding: '2px 7px 2px 6px',
        borderRadius: '0 2px 2px 0',
        whiteSpace: 'nowrap',
      }}
    >
      <Mono size={8} color={color} tracking="0.10em">
        {label}
      </Mono>
    </span>
  );
}
