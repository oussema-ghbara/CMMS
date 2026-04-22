import {
  IsEnum, IsNotEmpty, IsString, IsOptional, IsInt, Min, IsDateString,
} from 'class-validator';
import { WorkOrderType, WorkOrderPriority } from '@gmao/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFollowUpDto {
  @ApiProperty({ enum: WorkOrderType, description: 'Type of follow-up WO (typically CORRECTIVE)' })
  @IsEnum(WorkOrderType)
  type: WorkOrderType;

  @ApiProperty({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority)
  priority: WorkOrderPriority;

  @ApiProperty({ description: 'Description pre-filled with "Suite à [ref]: ..." supervisor may edit' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Estimated duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'ISO-8601 due date' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
