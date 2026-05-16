import { WorkOrderType } from '@gmao/shared';
import { Mono } from './mono';

const TYPE_COLOR: Record<WorkOrderType, string> = {
  [WorkOrderType.CORRECTIVE]:  'var(--sb-p-crit)',
  [WorkOrderType.PREVENTIVE]:  'var(--sb-p-norm)',
};

const TYPE_LABEL: Record<WorkOrderType, string> = {
  [WorkOrderType.CORRECTIVE]: 'CORRECTIF',
  [WorkOrderType.PREVENTIVE]: 'PRÉVENTIF',
};

interface TypeBadgeProps {
  type: WorkOrderType;
}

export function TypeBadge({ type }: TypeBadgeProps) {
  const color = TYPE_COLOR[type];
  const label = TYPE_LABEL[type];

  return (
    <span
      style={{
        display: 'inline-block',
        border: `1px solid ${color}44`,
        padding: '1px 6px',
        borderRadius: 2,
        whiteSpace: 'nowrap',
      }}
    >
      <Mono size={8} color={color} tracking="0.08em">
        {label}
      </Mono>
    </span>
  );
}
