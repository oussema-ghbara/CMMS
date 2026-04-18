import {
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WOCancellationReason, AssetStatus } from '@gmao/shared';

const DETAIL_REQUIRED_REASONS = new Set<WOCancellationReason>([
  WOCancellationReason.EXTERNAL_DECISION,
  WOCancellationReason.RESOLVED_OTHERWISE,
]);

export class CancelWorkOrderDto {
  @ApiProperty({ enum: WOCancellationReason })
  @IsEnum(WOCancellationReason)
  reason: WOCancellationReason;

  @ApiPropertyOptional()
  @ValidateIf((o: CancelWorkOrderDto) => DETAIL_REQUIRED_REASONS.has(o.reason))
  @IsNotEmpty({ message: 'workOrders.cancellationDetailRequired' })
  @Matches(/\S/, { message: 'workOrders.cancellationDetailRequired' })
  @IsString()
  detail?: string;

  @ApiPropertyOptional({ enum: AssetStatus, default: AssetStatus.OPERATIONAL })
  @IsOptional()
  @IsEnum(AssetStatus)
  postCancellationAssetStatus?: AssetStatus;
}
