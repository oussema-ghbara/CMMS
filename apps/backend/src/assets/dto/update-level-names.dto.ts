import { IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';

export class LevelNameItemDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  level: number;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdateLevelNamesDto {
  @ApiProperty({ type: [LevelNameItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LevelNameItemDto)
  items: LevelNameItemDto[];
}
