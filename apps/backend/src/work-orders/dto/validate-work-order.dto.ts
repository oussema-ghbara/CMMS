import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@gmao/db';

export class ValidateWorkOrderDto {
  /**
   * Required when the principal technician's last intervention result is
   * COULD_NOT_INTERVENE. The supervisor must explicitly choose the asset's
   * post-validation status instead of letting it default to OPERATIONAL.
   */
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
