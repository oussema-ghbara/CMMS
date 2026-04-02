import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WOCancellationReason, AssetStatus } from '@gmao/shared';

export class CancelWorkOrderDto {
  @ApiProperty({ enum: WOCancellationReason })
  @IsEnum(WOCancellationReason)
  reason: WOCancellationReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiPropertyOptional({ enum: AssetStatus, default: AssetStatus.OPERATIONAL })
  @IsOptional()
  @IsEnum(AssetStatus)
  postCancellationAssetStatus?: AssetStatus;
}
