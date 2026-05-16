import { WorkOrderStatus } from '@gmao/shared';
import { Mono } from './mono';

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:               'var(--sb-s-cancel)',
  [WorkOrderStatus.OPEN]:                'var(--sb-s-open)',
  [WorkOrderStatus.ASSIGNED]:            'var(--sb-s-active)',
  [WorkOrderStatus.IN_PROGRESS]:         'var(--sb-s-active)',
  [WorkOrderStatus.ON_HOLD]:             'var(--sb-s-wait)',
  [WorkOrderStatus.PENDING_VALIDATION]:  'var(--sb-s-wait)',
  [WorkOrderStatus.CLOSED]:              'var(--sb-s-done)',
  [WorkOrderStatus.CANCELLED]:           'var(--sb-s-cancel)',
};

const STATUS_BG: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:               'var(--sb-s-cancel-bg)',
  [WorkOrderStatus.OPEN]:                'var(--sb-s-open-bg)',
  [WorkOrderStatus.ASSIGNED]:            'var(--sb-s-active-bg)',
  [WorkOrderStatus.IN_PROGRESS]:         'var(--sb-s-active-bg)',
  [WorkOrderStatus.ON_HOLD]:             'var(--sb-s-wait-bg)',
  [WorkOrderStatus.PENDING_VALIDATION]:  'var(--sb-s-wait-bg)',
  [WorkOrderStatus.CLOSED]:              'var(--sb-s-done-bg)',
  [WorkOrderStatus.CANCELLED]:           'var(--sb-s-cancel-bg)',
};

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.DRAFT]:               'BROUILLON',
  [WorkOrderStatus.OPEN]:                'OUVERT',
  [WorkOrderStatus.ASSIGNED]:            'ASSIGNÉ',
  [WorkOrderStatus.IN_PROGRESS]:         'EN COURS',
  [WorkOrderStatus.ON_HOLD]:             'EN ATTENTE',
  [WorkOrderStatus.PENDING_VALIDATION]:  'VALIDATION',
  [WorkOrderStatus.CLOSED]:              'TERMINÉ',
  [WorkOrderStatus.CANCELLED]:           'ANNULÉ',
};

interface StatusPillProps {
  status: WorkOrderStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const color = STATUS_COLOR[status];
  const bg    = STATUS_BG[status];
  const label = STATUS_LABEL[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        border: `1px solid ${color}28`,
        borderRadius: 2,
        padding: '2px 7px 2px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <Mono size={9} color={color} tracking="0.10em">
        {label}
      </Mono>
    </span>
  );
}
