import { IsString, IsInt, Min, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SubmitPartRequestDto {
  @ApiPropertyOptional({ description: 'Catalog part ID. Required unless offCatalogDescription is provided.' })
  @IsOptional()
  @IsString()
  partId?: string;

  @ApiPropertyOptional({ description: 'Free-text description for off-catalog requests. Required unless partId is provided.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  offCatalogDescription?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantityRequested: number;

  @ApiPropertyOptional({ description: 'Readable note for the Storekeeper (not used in reports).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
