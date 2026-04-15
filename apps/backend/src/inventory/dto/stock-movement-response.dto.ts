import { ApiProperty } from '@nestjs/swagger';
import { StockMovementType } from '@gmao/shared';

export class StockMovementActorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

/**
 * Shaped response for GET /stock/movements/:partId.
 *
 * Field contract (matches the frontend StockMovement interface):
 *  - quantity   Signed: positive for INCOMING/RETURN/positive-ADJUSTMENT,
 *               negative for OUTGOING/negative-ADJUSTMENT.
 *  - balanceAfter  Stock level immediately after this movement was applied.
 *               Computed server-side from the part's current stock working
 *               backwards through the movement log (DESC order = newest first).
 *  - reason     Human-readable note: explicit note, then adjustment reason, then null.
 *  - referenceId  Related entity ID (workOrderId → partRequestId → null).
 *  - actor      The user who performed the movement.
 */
export class StockMovementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: StockMovementType })
  type: StockMovementType;

  @ApiProperty({ description: 'Signed quantity (negative for stock-decreasing movements)' })
  quantity: number;

  @ApiProperty({ description: 'Stock level immediately after this movement' })
  balanceAfter: number;

  @ApiProperty({ nullable: true })
  reason: string | null;

  @ApiProperty({ nullable: true, description: 'Related work-order or part-request ID' })
  referenceId: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: StockMovementActorDto, nullable: true })
  actor: StockMovementActorDto | null;
}
