import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnHoldReasonType } from '@gmao/shared';

export class ContributorBlockDto {
  @ApiProperty({ enum: OnHoldReasonType })
  @IsEnum(OnHoldReasonType)
  reasonType: OnHoldReasonType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;
}
