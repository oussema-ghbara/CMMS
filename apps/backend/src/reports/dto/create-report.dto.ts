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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  submittedDespiteWarning?: boolean;
}
