import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateEmailNotificationsDto {
  @ApiProperty({ description: 'Enable or disable email notifications for the authenticated user' })
  @IsBoolean()
  enabled: boolean;
}
