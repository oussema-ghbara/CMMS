import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@gmao/shared';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ enum: Role, isArray: true })
  roles: Role[];

  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;
}
