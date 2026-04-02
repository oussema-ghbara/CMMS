import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetupAccountDto {
  @ApiProperty({ description: 'Token reçu par e-mail' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Nouveau mot de passe' })
  @IsString()
  @MinLength(1)
  password: string;
}
