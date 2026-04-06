import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, IsPositive, IsISO8601, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreventiveFrequencyType } from '@gmao/db';

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PreventiveFrequencyType })
  @IsEnum(PreventiveFrequencyType)
  frequencyType: PreventiveFrequencyType;

  @ApiPropertyOptional({ description: 'Required when frequencyType is FIXED_INTERVAL_DAYS. Positive integer.' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  intervalDays?: number;

  @ApiPropertyOptional({ description: 'Standard 5-field cron expression. Required when frequencyType is CALENDAR.' })
  @IsOptional()
  @IsString()
  calendarExpression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Automatically assigned as principal technician on generated WOs.' })
  @IsOptional()
  @IsString()
  defaultTechnicianId?: string;

  @ApiPropertyOptional({ description: 'ISO8601 — when to generate the first WO. Defaults to next occurrence computed from frequency.' })
  @IsOptional()
  @IsISO8601()
  firstDueAt?: string;
}
