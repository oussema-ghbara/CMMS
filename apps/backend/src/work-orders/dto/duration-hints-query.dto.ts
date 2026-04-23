import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkOrderType } from '@gmao/shared';

export class DurationHintsQueryDto {
  @ApiProperty({ description: 'Asset ID to compute historical averages for' })
  @IsString()
  assetId: string;

  @ApiProperty({ enum: WorkOrderType, description: 'WO type filter for category and technician averages' })
  @IsEnum(WorkOrderType)
  type: WorkOrderType;

  @ApiPropertyOptional({ description: 'Technician ID to include their personal average (last 10 closed WOs of same type)' })
  @IsOptional()
  @IsString()
  technicianId?: string;
}
