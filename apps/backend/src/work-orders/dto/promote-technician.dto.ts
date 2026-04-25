import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WOReassignmentReason } from '@gmao/shared';

export class PromoteTechnicianDto {
  @ApiProperty()
  @IsString()
  newPrincipalId: string;

  /** §5.3: The reason for this promotion, recorded in the WorkOrderReassignment log. */
  @ApiPropertyOptional({ enum: WOReassignmentReason })
  @IsOptional()
  @IsEnum(WOReassignmentReason)
  reason?: WOReassignmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonDetail?: string;
}
