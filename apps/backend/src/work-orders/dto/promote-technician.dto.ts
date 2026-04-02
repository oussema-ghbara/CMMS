import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PromoteTechnicianDto {
  @ApiProperty()
  @IsString()
  newPrincipalId: string;
}
