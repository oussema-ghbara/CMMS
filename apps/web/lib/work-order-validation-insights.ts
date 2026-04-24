import type { WorkOrderTimeDeviation } from './work-orders.api';

export type TimeDeviationDirection = 'none' | 'over' | 'under' | 'equal';

export function getContributorWithoutLogNames(
  contributorsWithoutLog: Array<{ name: string }>,
): string {
  return contributorsWithoutLog.map((contributor) => contributor.name).join(', ');
}

export function getTimeDeviationPresentation(timeDeviation: WorkOrderTimeDeviation | null | undefined): {
  absoluteDeviationMinutes: number | null;
  absoluteDeviationPercent: number | null;
  direction: TimeDeviationDirection;
} {
  if (!timeDeviation || timeDeviation.deltaMinutes == null) {
    return {
      absoluteDeviationMinutes: null,
      absoluteDeviationPercent: null,
      direction: 'none',
    };
  }

  const direction: TimeDeviationDirection =
    timeDeviation.deltaMinutes > 0
      ? 'over'
      : timeDeviation.deltaMinutes < 0
        ? 'under'
        : 'equal';

  return {
    absoluteDeviationMinutes: Math.abs(timeDeviation.deltaMinutes),
    absoluteDeviationPercent:
      timeDeviation.deltaPercent == null ? null : Math.abs(timeDeviation.deltaPercent),
    direction,
  };
}
