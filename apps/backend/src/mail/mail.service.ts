import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { SendMailDto } from './dto/send-mail.dto';
import { MAIL_QUEUE, MAIL_JOB_SEND } from './mail.constants';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly cfg: ConfigService,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue<SendMailDto>,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Mail queue ready — SMTP: ${this.cfg.get<string>('SMTP_HOST')}:${this.cfg.get<number>('SMTP_PORT')}`,
    );
  }

  async enqueue(dto: SendMailDto): Promise<void> {
    await this.mailQueue.add(MAIL_JOB_SEND, dto, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.logger.debug(`Mail job enqueued → ${dto.to} [${dto.template}]`);
  }
}
