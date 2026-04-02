import { IsEmail, IsString, IsArray, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@gmao/shared';

export class CreateUserDto {
  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'jean.dupont@gmao.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @IsEnum(Role, { each: true })
  roles: Role[];

  @ApiPropertyOptional({ description: 'Taux horaire (Admin uniquement, non visible par le Technicien)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}
