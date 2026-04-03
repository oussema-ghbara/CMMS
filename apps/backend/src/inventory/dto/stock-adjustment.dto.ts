import { IsString, IsInt, IsEnum, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StockAdjustmentReason } from '@gmao/shared';

export class StockAdjustmentDto {
  @ApiProperty()
  @IsString()
  partId: string;

  @ApiProperty({
    description: 'Positive to add stock, negative to remove. Final stock cannot go below 0.',
  })
  @IsInt()
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ enum: StockAdjustmentReason })
  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;

  @ApiPropertyOptional({ description: 'Required when reason is OTHER.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  detail?: string;
}
