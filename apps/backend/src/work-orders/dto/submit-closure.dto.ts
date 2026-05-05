import { IsEnum, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterventionResult, InterventionActionType } from '@gmao/shared';

export class InterventionActionDto {
  @ApiProperty({ enum: InterventionActionType })
  @IsEnum(InterventionActionType)
  actionType: InterventionActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;
}

export class SubmitClosureDto {
  @ApiProperty({ enum: InterventionResult })
  @IsEnum(InterventionResult)
  result: InterventionResult;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resultExplanation?: string;

  @ApiPropertyOptional({ type: [InterventionActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterventionActionDto)
  actions?: InterventionActionDto[];
}
