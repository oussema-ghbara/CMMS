import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistItemStatus } from '@gmao/shared';

export class CompleteChecklistItemDto {
  @ApiProperty({ enum: [ChecklistItemStatus.DONE, ChecklistItemStatus.ANOMALY_DETECTED, ChecklistItemStatus.NOT_APPLICABLE] })
  @IsEnum(ChecklistItemStatus)
  status: ChecklistItemStatus;

  @ApiPropertyOptional({ description: 'Required when status is ANOMALY_DETECTED' })
  @IsOptional()
  @IsString()
  anomalyDescription?: string;

  @ApiPropertyOptional({ description: 'Required when status is NOT_APPLICABLE' })
  @IsOptional()
  @IsString()
  notApplicableReason?: string;
}
