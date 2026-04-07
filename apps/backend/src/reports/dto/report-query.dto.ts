import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProblemReportStatus, UrgencyPerception } from '@gmao/db';

export class ReportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProblemReportStatus })
  @IsOptional()
  @IsEnum(ProblemReportStatus)
  status?: ProblemReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reporterId?: string;

  @ApiPropertyOptional({ enum: UrgencyPerception })
  @IsOptional()
  @IsEnum(UrgencyPerception)
  urgencyPerception?: UrgencyPerception;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
