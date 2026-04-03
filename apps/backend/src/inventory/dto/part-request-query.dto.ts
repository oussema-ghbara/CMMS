import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PartRequestStatus } from '@gmao/shared';

export class PartRequestQueryDto {
  @ApiPropertyOptional({ enum: PartRequestStatus })
  @IsOptional()
  @IsEnum(PartRequestStatus)
  status?: PartRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by linked work order ID.' })
  @IsOptional()
  @IsString()
  workOrderId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
