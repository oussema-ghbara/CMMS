import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { CertificatesService } from '../certificates.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { NotificationType } from '@gmao/db';

@Injectable()
export class CertificateExpiryJob {
  private readonly logger = new Logger(CertificateExpiryJob.name);

  constructor(
    private readonly certificates: CertificatesService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Timeout(0)
  async runOnStartup(): Promise<void> {
    await this.run();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    this.logger.log('Running certificate expiry check');
    try {
      await this.certificates.refreshStatuses();
      await this.notifyExpiring();
    } catch (err) {
      this.logger.error('Certificate expiry job failed', err);
    }
  }

  private async notifyExpiring(): Promise<void> {
    const expiring = await this.certificates.findExpiringSoon();

    const supervisors = await this.prisma.user.findMany({
      where: { roles: { has: 'SUPERVISOR' }, isActive: true },
      select: { id: true, email: true, name: true },
    });

    if (supervisors.length === 0) return;

    for (const cert of expiring) {
      const daysLeft = Math.floor(
        (cert.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      const shouldNotify = daysLeft <= 7 || daysLeft === 30 || daysLeft === 60;
      if (!shouldNotify) continue;

      const summary = `Certificate for asset "${cert.asset.name}" expires in ${daysLeft} day(s)`;

      for (const supervisor of supervisors) {
        await this.prisma.notification.create({
          data: {
            recipientId: supervisor.id,
            type: NotificationType.CERTIFICATE_EXPIRING,
            title: 'Certificate Expiring',
            summary,
            entityType: 'ComplianceCertificate',
            entityId: cert.id,
          },
        });

        await this.mail.enqueue({
          to: supervisor.email,
          template: 'certificate-expiry',
          context: {
            supervisorName: supervisor.name,
            assetName: cert.asset.name,
            daysLeft: String(daysLeft),
            expirationDate: cert.expirationDate.toISOString().split('T')[0],
          },
        });
      }
    }
  }
}
