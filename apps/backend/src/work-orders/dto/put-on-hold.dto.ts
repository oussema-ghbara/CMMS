import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnHoldReasonType, AssetStatus } from '@gmao/shared';

export class PutOnHoldDto {
  @ApiProperty({ enum: OnHoldReasonType })
  @IsEnum(OnHoldReasonType)
  reasonType: OnHoldReasonType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedResolutionDate?: string;

  @ApiPropertyOptional({
    enum: AssetStatus,
    description: 'Required when reasonType is OTHER — supervisor chooses asset status',
  })
  @IsOptional()
  @IsEnum(AssetStatus)
  supervisorAssetStatusChoice?: AssetStatus;
}
