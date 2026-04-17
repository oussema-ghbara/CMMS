import { CronExpression } from '@nestjs/schedule';
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULE_TIMEOUT_OPTIONS,
} from '@nestjs/schedule/dist/schedule.constants';
import { NotificationType } from '@gmao/db';
import { CertificateExpiryJob } from './certificate-expiry.job';

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildMocks() {
  const certificates = {
    refreshStatuses: jest.fn().mockResolvedValue(undefined),
    findExpiringSoon: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };

  const mail = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };

  const job = new CertificateExpiryJob(
    certificates as never,
    prisma as never,
    mail as never,
  );

  return { job, certificates, prisma, mail };
}

describe('CertificateExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('schedule decorators', () => {
    it('registers run() with a daily midnight cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        CertificateExpiryJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_DAY_AT_MIDNIGHT);
    });

    it('registers runOnStartup() as an immediate timeout', () => {
      const timeoutOptions = Reflect.getMetadata(
        SCHEDULE_TIMEOUT_OPTIONS,
        CertificateExpiryJob.prototype.runOnStartup,
      ) as { timeout?: number } | undefined;

      expect(timeoutOptions).toBeDefined();
      expect(timeoutOptions?.timeout).toBe(0);
    });
  });

  describe('runOnStartup()', () => {
    it('delegates to run()', async () => {
      const { job } = buildMocks();
      const runSpy = jest.spyOn(job, 'run').mockResolvedValue(undefined);

      await job.runOnStartup();

      expect(runSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('run()', () => {
    it('refreshes statuses and processes reminders', async () => {
      const { job, certificates, prisma } = buildMocks();
      certificates.findExpiringSoon.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await job.run();

      expect(certificates.refreshStatuses).toHaveBeenCalledTimes(1);
      expect(certificates.findExpiringSoon).toHaveBeenCalledTimes(1);
    });

    it('swallows failures and does not throw', async () => {
      const { job, certificates } = buildMocks();
      certificates.refreshStatuses.mockRejectedValue(new Error('db unavailable'));

      await expect(job.run()).resolves.toBeUndefined();
      expect(certificates.findExpiringSoon).not.toHaveBeenCalled();
    });

    it('does nothing when there are no active supervisors', async () => {
      const { job, certificates, prisma, mail } = buildMocks();
      const now = new Date('2026-04-17T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      certificates.findExpiringSoon.mockResolvedValue([
        {
          id: 'cert-1',
          assetId: 'asset-1',
          expirationDate: addDays(now, 7),
          asset: { name: 'Mixer-01' },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      await job.run();

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('notifies each active supervisor for thresholds 60, 30, and <= 7 days', async () => {
      const { job, certificates, prisma, mail } = buildMocks();
      const now = new Date('2026-04-17T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const supervisors = [
        { id: 'sup-1', email: 'sup1@example.com', name: 'Sup One' },
        { id: 'sup-2', email: 'sup2@example.com', name: 'Sup Two' },
      ];

      prisma.user.findMany.mockResolvedValue(supervisors);
      certificates.findExpiringSoon.mockResolvedValue([
        {
          id: 'cert-60',
          assetId: 'asset-1',
          expirationDate: addDays(now, 60),
          asset: { name: 'Asset 60' },
        },
        {
          id: 'cert-30',
          assetId: 'asset-2',
          expirationDate: addDays(now, 30),
          asset: { name: 'Asset 30' },
        },
        {
          id: 'cert-7',
          assetId: 'asset-3',
          expirationDate: addDays(now, 7),
          asset: { name: 'Asset 7' },
        },
        {
          id: 'cert-3',
          assetId: 'asset-4',
          expirationDate: addDays(now, 3),
          asset: { name: 'Asset 3' },
        },
        {
          id: 'cert-45',
          assetId: 'asset-5',
          expirationDate: addDays(now, 45),
          asset: { name: 'Asset 45' },
        },
      ]);

      await job.run();

      // 4 eligible certificates (60, 30, 7, 3) x 2 supervisors
      expect(prisma.notification.create).toHaveBeenCalledTimes(8);
      expect(mail.enqueue).toHaveBeenCalledTimes(8);

      const notifiedIds = prisma.notification.create.mock.calls.map(
        (call: [{ data: { entityId: string } }]) => call[0].data.entityId,
      );
      expect(notifiedIds).toEqual(
        expect.arrayContaining(['cert-60', 'cert-30', 'cert-7', 'cert-3']),
      );
      expect(notifiedIds).not.toContain('cert-45');

      const firstNotification = prisma.notification.create.mock.calls[0][0].data;
      expect(firstNotification.type).toBe(NotificationType.CERTIFICATE_EXPIRING);
      expect(firstNotification.entityType).toBe('ComplianceCertificate');

      const subjects = prisma.notification.create.mock.calls.map(
        (call: [{ data: { summary: string } }]) => call[0].data.summary,
      );
      expect(subjects.some((summary: string) => summary.includes('expires in 60 day(s)'))).toBe(true);
    });
  });
});
