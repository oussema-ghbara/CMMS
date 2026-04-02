import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveHoldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionNote?: string;

  @ApiPropertyOptional({ description: 'Contractor cost — capture at resolution for EXTERNAL_CONTRACTOR holds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  contractorCost?: number;
}
