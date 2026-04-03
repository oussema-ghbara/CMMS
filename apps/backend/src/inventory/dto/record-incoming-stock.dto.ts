import { IsString, IsInt, Min, IsOptional, IsNumber, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RecordIncomingStockDto {
  @ApiProperty({ description: 'Must exist in the catalog — no bypassing catalog creation.' })
  @IsString()
  partId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional({ description: 'Updated unit cost if price differs from catalog. Updates catalog record.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unitCost?: number;
}
