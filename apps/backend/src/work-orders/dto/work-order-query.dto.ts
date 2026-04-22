import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkOrderStatus, WorkOrderType, WorkOrderPriority } from '@gmao/shared';

export class WorkOrderQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ enum: WorkOrderType })
  @IsOptional()
  @IsEnum(WorkOrderType)
  type?: WorkOrderType;

  @ApiPropertyOptional({ enum: WorkOrderPriority })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'ISO-8601 date — return only WOs closed at or after this timestamp' })
  @IsOptional()
  @IsDateString()
  closedAfter?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 date — return only WOs closed at or before this timestamp' })
  @IsOptional()
  @IsDateString()
  closedBefore?: string;
}
