import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@gmao/db';

export class ValidateWorkOrderDto {

  @ApiPropertyOptional({
    enum: AssetStatus,
    description:
      'Mandatory when the closure result is COULD_NOT_INTERVENE. ' +
      'Supervisor must explicitly declare the asset status.',
  })
  @IsOptional()
  @IsEnum(AssetStatus)
  assetStatusOverride?: AssetStatus;
}
