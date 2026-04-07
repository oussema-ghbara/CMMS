import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeferReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
