import { StockMovementType } from '@gmao/db';

export interface WorkOrderCostSource {
  contractorCost?: unknown;
  interventionLogs?: Array<{
    activeDurationMinutes: number | null;
    hourlyRateAtTime: unknown;
  }>;
  stockMovements?: Array<{
    type?: StockMovementType | string;
    quantity?: number;
    unitCostAtTime: unknown;
  }>;
}

export interface WorkOrderCostSummary {
  contractorCost: number;
  laborCost: number;
  partsCost: number;
  totalCost: number;
}

const CURRENCY_SCALE = 100;

function toAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

export function calculateWorkOrderCostSummary(workOrder: WorkOrderCostSource): WorkOrderCostSummary {
  const contractorCost = roundCurrency(toAmount(workOrder.contractorCost));

  const laborCost = roundCurrency(
    (workOrder.interventionLogs ?? []).reduce((sum, log) => {
      const activeDurationMinutes = Number(log.activeDurationMinutes ?? 0);
      const hourlyRateAtTime = toAmount(log.hourlyRateAtTime);

      if (activeDurationMinutes <= 0 || hourlyRateAtTime <= 0) {
        return sum;
      }

      return sum + hourlyRateAtTime * (activeDurationMinutes / 60);
    }, 0),
  );

  const partsCost = roundCurrency(
    (workOrder.stockMovements ?? []).reduce((sum, movement) => {
      if (movement.type !== StockMovementType.OUTGOING) {
        return sum;
      }

      const quantity = Number(movement.quantity ?? 0);
      const unitCostAtTime = toAmount(movement.unitCostAtTime);

      if (quantity <= 0 || unitCostAtTime <= 0) {
        return sum;
      }

      return sum + quantity * unitCostAtTime;
    }, 0),
  );

  return {
    contractorCost,
    laborCost,
    partsCost,
    totalCost: roundCurrency(contractorCost + laborCost + partsCost),
  };
}