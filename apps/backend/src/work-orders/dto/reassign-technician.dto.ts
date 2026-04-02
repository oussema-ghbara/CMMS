import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WOReassignmentReason } from '@gmao/shared';

export class ReassignTechnicianDto {
  @ApiProperty()
  @IsString()
  newTechnicianId: string;

  @ApiProperty({ enum: WOReassignmentReason })
  @IsEnum(WOReassignmentReason)
  reason: WOReassignmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonDetail?: string;
}
