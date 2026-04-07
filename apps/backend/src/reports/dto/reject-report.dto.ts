import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportRejectionReason } from '@gmao/db';

export class RejectReportDto {
  @ApiProperty({ enum: ReportRejectionReason })
  @IsEnum(ReportRejectionReason)
  reason: ReportRejectionReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;
}
