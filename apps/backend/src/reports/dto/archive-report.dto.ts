import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportArchiveReason } from '@gmao/db';

export class ArchiveReportDto {
  @ApiPropertyOptional({ enum: ReportArchiveReason })
  @IsOptional()
  @IsEnum(ReportArchiveReason)
  archiveReason?: ReportArchiveReason;

  @ApiPropertyOptional({ enum: ReportArchiveReason, deprecated: true })
  @IsOptional()
  @IsEnum(ReportArchiveReason)
  reason?: ReportArchiveReason;
}
