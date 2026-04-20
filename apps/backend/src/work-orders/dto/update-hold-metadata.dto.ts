import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHoldMetadataDto {
  @ApiPropertyOptional({
    description:
      'ISO date string — mandatory deadline for EXTERNAL_CONTRACTOR holds. ' +
      'Setting this enables the CONTRACTOR_DATE_OVERDUE scheduled notification.',
  })
  @IsOptional()
  @IsDateString()
  expectedResolutionDate?: string;

  @ApiPropertyOptional({
    description:
      'ISO date string — planned retry timestamp for ACCESS_DENIED holds. ' +
      'Setting this enables the ACCESS_RETRY_APPROACHING scheduled notification.',
  })
  @IsOptional()
  @IsDateString()
  retryDate?: string;

  @ApiPropertyOptional({
    description:
      'Supervisor-authored resolution plan note — required within 24 h for OTHER holds. ' +
      'Must be set by the supervisor before the technician resumes.',
  })
  @IsOptional()
  @IsString()
  resolutionNote?: string;
}
