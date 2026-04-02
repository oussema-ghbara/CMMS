import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidationRejectionReason } from '@gmao/shared';

export class RejectValidationDto {
  @ApiProperty({ enum: ValidationRejectionReason })
  @IsEnum(ValidationRejectionReason)
  rejectionReason: ValidationRejectionReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionDetail?: string;
}
