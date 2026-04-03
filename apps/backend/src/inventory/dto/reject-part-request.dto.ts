import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartRequestRejectionReason } from '@gmao/shared';

export class RejectPartRequestDto {
  @ApiProperty({ enum: PartRequestRejectionReason })
  @IsEnum(PartRequestRejectionReason)
  reason: PartRequestRejectionReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
