import { ApiProperty } from '@nestjs/swagger';
import { StockMovementType } from '@gmao/shared';

export class StockMovementActorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

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
