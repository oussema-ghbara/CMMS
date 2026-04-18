import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  imports: [
    MailModule,
    // JwtModule with empty registration — secrets are resolved at call-time
    // via ConfigService inside the gateway, matching the pattern in AuthModule.
    JwtModule.register({}),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}

