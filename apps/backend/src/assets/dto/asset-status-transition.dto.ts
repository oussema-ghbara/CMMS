import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@gmao/shared';

const ALLOWED_MANUAL_STATUSES = [
  AssetStatus.OUT_OF_SERVICE,
  AssetStatus.DECOMMISSIONED,
  AssetStatus.OPERATIONAL,
] as const;

export type ManualAssetStatus = (typeof ALLOWED_MANUAL_STATUSES)[number];

export class AssetStatusTransitionDto {
  @ApiProperty({ enum: ALLOWED_MANUAL_STATUSES })
  @IsEnum(AssetStatus)
  status: ManualAssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
