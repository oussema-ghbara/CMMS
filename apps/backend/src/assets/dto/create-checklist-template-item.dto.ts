import { IsString, IsOptional, IsBoolean, IsInt, Min, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistTaskType } from '@gmao/shared';

export class CreateChecklistTemplateItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({ enum: ChecklistTaskType })
  @IsEnum(ChecklistTaskType)
  taskType: ChecklistTaskType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  expectedCondition?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoCreateCorrectiveWO?: boolean;
}
