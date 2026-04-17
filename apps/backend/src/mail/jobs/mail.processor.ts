import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import type { SendMailDto } from '../dto/send-mail.dto';
import { MAIL_QUEUE } from '../mail.constants';

// Templates are compiled once at processor startup and reused for all jobs.
// This avoids reading and compiling the template file on every email send.
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function getTemplate(name: string): HandlebarsTemplateDelegate {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const templatePath = path.join(__dirname, '..', 'templates', `${name}.hbs`);
  const source = fs.readFileSync(templatePath, 'utf8');
  const compiled = Handlebars.compile(source);
  templateCache.set(name, compiled);
  return compiled;
}

const SUBJECT_MAP: Record<string, string> = {
  'setup-account': 'Configurer votre compte GMAO',
  'password-reset': 'Réinitialisation de votre mot de passe GMAO',
  'certificate-expiry': '[GMAO] Certificat de conformité expirant',
  'notification': '[GMAO] Notification',
  'daily-summary': '[GMAO] Résumé quotidien des ordres de travail',
};

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly cfg: ConfigService) {
    super();
  }

  async process(job: Job<SendMailDto>): Promise<void> {
    const { to, template, context } = job.data;

    const transporter = nodemailer.createTransport({
      host: this.cfg.getOrThrow<string>('SMTP_HOST'),
      port: this.cfg.get<number>('SMTP_PORT', 1025),
      secure: false,
      auth:
        this.cfg.get<string>('SMTP_USER')
          ? {
              user: this.cfg.get<string>('SMTP_USER'),
              pass: this.cfg.get<string>('SMTP_PASS'),
            }
          : undefined,
    });

    const render = getTemplate(template);
    const html = render(context);
    const subject = SUBJECT_MAP[template] ?? 'Notification GMAO';

    await transporter.sendMail({
      from: this.cfg.get<string>('SMTP_FROM', 'gmao@localhost'),
      to,
      subject,
      html,
    });

    this.logger.log(`Mail sent → ${to} [${template}] (job ${job.id})`);
  }
}
