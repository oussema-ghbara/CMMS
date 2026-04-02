import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetCriticality } from '@gmao/shared';

export class CreateAssetDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  installationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyExpiration?: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty()
  @IsString()
  locationId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ enum: AssetCriticality, default: AssetCriticality.STANDARD })
  @IsOptional()
  @IsEnum(AssetCriticality)
  criticality?: AssetCriticality;
}
