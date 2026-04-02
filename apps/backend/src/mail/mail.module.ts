import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailProcessor } from './jobs/mail.processor';
import { MAIL_QUEUE } from './mail.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          // BullMQ takes a connection options object, not a full URL string.
          // We parse REDIS_URL (redis://host:port) into host/port here.
          host: new URL(cfg.getOrThrow<string>('REDIS_URL')).hostname,
          port: parseInt(new URL(cfg.getOrThrow<string>('REDIS_URL')).port || '6379', 10),
        },
      }),
    }),
    BullModule.registerQueue({ name: MAIL_QUEUE }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
