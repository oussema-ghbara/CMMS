import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendSetupDto {
  @ApiProperty({ example: 'user@gmao.local' })
  @IsEmail()
  email: string;
}