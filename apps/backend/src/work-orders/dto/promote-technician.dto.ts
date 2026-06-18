import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WOReassignmentReason } from '@gmao/shared';

export class PromoteTechnicianDto {
  @ApiProperty()
  @IsString()
  newPrincipalId: string;

  @ApiPropertyOptional({ enum: WOReassignmentReason })
  @IsOptional()
  @IsEnum(WOReassignmentReason)
  reason?: WOReassignmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonDetail?: string;
}
