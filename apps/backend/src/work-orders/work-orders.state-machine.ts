import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkOrderStatus, Role } from '@gmao/db';

const TERMINAL = new Set<WorkOrderStatus>([WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED]);

// Explicit allowed transitions: [from][to] → roles that can perform it
const TRANSITIONS: Partial<Record<WorkOrderStatus, Partial<Record<WorkOrderStatus, Role[]>>>> = {
// satisfies the exhaustive enum — all keys are WorkOrderStatus values
  [WorkOrderStatus.DRAFT]: {
    [WorkOrderStatus.OPEN]: [Role.SUPERVISOR],
  },
  [WorkOrderStatus.OPEN]: {
    [WorkOrderStatus.ASSIGNED]: [Role.SUPERVISOR],
  },
  [WorkOrderStatus.ASSIGNED]: {
    [WorkOrderStatus.IN_PROGRESS]: [Role.TECHNICIAN],
  },
  [WorkOrderStatus.IN_PROGRESS]: {
    [WorkOrderStatus.ON_HOLD]: [Role.TECHNICIAN],
    [WorkOrderStatus.PENDING_VALIDATION]: [Role.TECHNICIAN],
  },
  [WorkOrderStatus.ON_HOLD]: {
    [WorkOrderStatus.IN_PROGRESS]: [Role.TECHNICIAN],
  },
  [WorkOrderStatus.PENDING_VALIDATION]: {
    [WorkOrderStatus.CLOSED]: [Role.SUPERVISOR],
    [WorkOrderStatus.IN_PROGRESS]: [Role.SUPERVISOR], // rejection path
  },
};

export function assertTransitionAllowed(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actorRoles: Role[],
): void {
  if (TERMINAL.has(from)) {
    throw new BadRequestException(
      `Work order is in terminal status ${from} — no further transitions allowed`,
    );
  }

  if (to === WorkOrderStatus.CANCELLED) {
    if (!actorRoles.includes(Role.SUPERVISOR)) {
      throw new ForbiddenException('Only a Supervisor can cancel a work order');
    }
    return;
  }

  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new BadRequestException(`Transition ${from} → ${to} is not a valid state machine transition`);
  }

  if (!allowedRoles.some((r) => actorRoles.includes(r))) {
    throw new ForbiddenException(`Your role does not permit transitioning from ${from} to ${to}`);
  }
}

export function isTerminal(status: WorkOrderStatus): boolean {
  return TERMINAL.has(status);
}
