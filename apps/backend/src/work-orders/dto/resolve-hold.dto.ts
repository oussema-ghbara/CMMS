import { IsOptional, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveHoldDto {
  @ApiPropertyOptional({
    description:
      'Contractor cost — capture at resolution for EXTERNAL_CONTRACTOR holds. ' +
      'The supervisor resolution plan note is set separately via PATCH /hold-metadata.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  contractorCost?: number;
}
