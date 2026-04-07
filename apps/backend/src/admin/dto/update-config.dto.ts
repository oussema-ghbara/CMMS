import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConfigDto {
  @ApiProperty({ example: '8' })
  @IsString()
  @IsNotEmpty()
  value: string;
}
