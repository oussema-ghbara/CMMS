import {
  IsString, IsEnum, IsOptional, IsDateString, IsInt, Min, MaxLength, IsBoolean, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkOrderType, WorkOrderPriority } from '@gmao/shared';

export class CreateWorkOrderDto {
  @ApiProperty({ enum: WorkOrderType })
  @IsEnum(WorkOrderType)
  type: WorkOrderType;

  @ApiProperty({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority)
  priority: WorkOrderPriority;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @ApiProperty()
  @IsString()
  assetId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Set to true to bypass the duplicate-WO guard when you intentionally ' +
      'create a second work order for an asset that already has an active one.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;

  @ApiPropertyOptional({
    description:
      'Pre-assign a principal technician at creation time. ' +
      'When provided the WO is automatically published (DRAFT → OPEN) and assigned (OPEN → ASSIGNED).',
  })
  @IsOptional()
  @IsString()
  principalTechnicianId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Contributor technician IDs (requires principalTechnicianId)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contributorIds?: string[];
}
