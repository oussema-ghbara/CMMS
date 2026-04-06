import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ChecklistTaskType } from '@gmao/db';

export class CreatePlanChecklistItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: ChecklistTaskType })
  @IsEnum(ChecklistTaskType)
  taskType: ChecklistTaskType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedCondition?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Display order within the checklist.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false, description: 'Automatically open a corrective WO when ANOMALY_DETECTED during execution.' })
  @IsOptional()
  @IsBoolean()
  autoCreateCorrectiveWO?: boolean;
}
