import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
