import { IsString, IsNotEmpty, IsEnum, IsInt, Min, IsOptional, IsNumber, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PartUnit } from '@gmao/shared';

export class CreatePartDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Unique reference code. Rejected if duplicate exists (including inactive parts).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  referenceCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: PartUnit })
  @IsEnum(PartUnit)
  unit: PartUnit;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minimumStockThreshold?: number;

  @ApiPropertyOptional({ description: 'Warehouse location code (shelf, aisle, bin).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  warehouseLocation?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unitCost?: number;
}
