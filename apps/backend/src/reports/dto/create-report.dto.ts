import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UrgencyPerception } from '@gmao/db';

export class CreateReportDto {
  @ApiProperty()
  @IsString()
  assetId: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({ enum: UrgencyPerception })
  @IsEnum(UrgencyPerception)
  urgencyPerception: UrgencyPerception;

  // §9.8: true when the requester explicitly confirms submission after seeing the
  // duplicate-WO warning banner. Defaults to false when not provided.
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  submittedDespiteWarning?: boolean;
}
