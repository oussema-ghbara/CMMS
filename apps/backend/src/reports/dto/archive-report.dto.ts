import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Work order reference that replaces this report (required when reason is REPLACED_BY_OTHER_WO)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  linkedWorkOrderRef?: string;
}
