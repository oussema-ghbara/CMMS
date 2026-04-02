import { IsEnum, IsString, IsDateString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateType } from '@gmao/shared';

export class CreateCertificateDto {
  @ApiProperty({ enum: CertificateType })
  @IsEnum(CertificateType)
  certificateType: CertificateType;

  @ApiPropertyOptional({ description: 'Required when certificateType is OTHER' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  otherType?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  issuingAuthority: string;

  @ApiProperty()
  @IsDateString()
  issueDate: string;

  @ApiProperty()
  @IsDateString()
  expirationDate: string;
}
