import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@gmao/shared';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Role, isArray: true })
  roles: Role[];

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Technician hourly rate set by Admin' })
  hourlyRate?: number | null;

  @ApiPropertyOptional()
  lastLoginAt?: Date | null;

  @ApiProperty()
  createdAt: Date;
}
