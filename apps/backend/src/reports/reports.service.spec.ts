import { BadRequestException } from '@nestjs/common';
import { AssetStatus, ProblemReportStatus, ReportArchiveReason, ReportRejectionReason, WorkOrderPriority } from '@gmao/db';
import { ReportsService } from './reports.service';

describe('ReportsService edge cases', () => {
  const createService = () => {
    const repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      addComment: jest.fn(),
      acknowledgeComment: jest.fn(),
      updateStatus: jest.fn(),
    };

    const notifications = {
      notifySupervisors: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };

    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      problemReport: {
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workOrder: {
        count: jest.fn(),
        create: jest.fn(),
      },
      workOrderStatusLog: {
        create: jest.fn(),
      },
    };

    const prisma = {
      asset: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      problemReportComment: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };

    const service = new ReportsService(
      repo as never,
      prisma as never,
      notifications as never,
    );

    return { service, repo, prisma, notifications, tx };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects report submission when the asset does not exist', async () => {
    const { service, prisma, notifications } = createService();
    prisma.asset.findUnique.mockResolvedValue(null);

    await expect(
      service.submit(
        {
          assetId: 'asset-1',
          description: 'Machine stopped unexpectedly',
          urgencyPerception: 'MACHINE_STOPPED',
        },
        'user-1',
      ),
    ).rejects.toThrow('Asset asset-1 not found');

    expect(notifications.notifySupervisors).not.toHaveBeenCalled();
  });

  it('rejects report submission for decommissioned assets', async () => {
    const { service, prisma, notifications } = createService();
    prisma.asset.findUnique.mockResolvedValue({ status: AssetStatus.DECOMMISSIONED });

    await expect(
      service.submit(
        {
          assetId: 'asset-1',
          description: 'Machine stopped unexpectedly',
          urgencyPerception: 'MACHINE_STOPPED',
        },
        'user-1',
      ),
    ).rejects.toThrow('Cannot submit a report for a decommissioned asset');

    expect(notifications.notifySupervisors).not.toHaveBeenCalled();
  });

  it('creates a report and notifies supervisors for a valid submission', async () => {
    const { service, prisma, notifications, tx } = createService();
    prisma.asset.findUnique.mockResolvedValue({ status: AssetStatus.OPERATIONAL });
    tx.problemReport.findFirst.mockResolvedValue({ referenceNumber: 'PR-2026-000004' });
    tx.problemReport.create.mockResolvedValue({ id: 'report-1', referenceNumber: 'PR-2026-000005' });

    const report = await service.submit(
      {
        assetId: 'asset-1',
        description: 'Machine stopped unexpectedly',
        urgencyPerception: 'MACHINE_STOPPED',
      },
      'user-1',
    );

    expect(report).toEqual({ id: 'report-1', referenceNumber: 'PR-2026-000005' });
    expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
  });

  it('blocks conversion unless the report is pending', async () => {
    const { service, repo } = createService();
    repo.findById.mockResolvedValue({ status: ProblemReportStatus.CONVERTED });

    await expect(
      service.convert(
        'report-1',
        {
          priority: WorkOrderPriority.HIGH,
        },
        'user-1',
      ),
    ).rejects.toThrow('Only PENDING reports can be converted');
  });

  it('blocks conversion when the linked asset is missing', async () => {
    const { service, repo, prisma } = createService();
    repo.findById.mockResolvedValue({ id: 'report-1', status: ProblemReportStatus.PENDING, assetId: 'asset-1', description: 'Test' });
    prisma.asset.findUnique.mockResolvedValue(null);

    await expect(service.convert('report-1', {}, 'user-1')).rejects.toThrow('Asset asset-1 not found');
  });

  it('blocks conversion for decommissioned assets', async () => {
    const { service, repo, prisma } = createService();
    repo.findById.mockResolvedValue({ id: 'report-1', status: ProblemReportStatus.PENDING, assetId: 'asset-1', description: 'Test' });
    prisma.asset.findUnique.mockResolvedValue({ status: AssetStatus.DECOMMISSIONED, location: { fullPath: 'Site > Line > Machine' } });

    await expect(service.convert('report-1', {}, 'user-1')).rejects.toThrow('Cannot convert a report for a decommissioned asset into a work order');
  });

  it('blocks reject, defer, reopen, and archive transitions from invalid states', async () => {
    const { service, repo } = createService();
    repo.findById.mockResolvedValue({ id: 'report-1', status: ProblemReportStatus.CONVERTED, assetId: 'asset-1', referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' });

    await expect(
      service.reject('report-1', { reason: ReportRejectionReason.INVALID_REPORT }, 'user-1'),
    ).rejects.toThrow('Only PENDING reports can be rejected');

    await expect(service.defer('report-1', { note: 'Hold on' }, 'user-1')).rejects.toThrow('Only PENDING reports can be deferred');
    await expect(service.reopen('report-1', 'user-1')).rejects.toThrow('Only DEFERRED reports can be reopened');
    await expect(service.archive('report-1', { archiveReason: ReportArchiveReason.MANAGEMENT_DECISION }, 'user-1')).rejects.toThrow('Only PENDING or DEFERRED reports can be archived');
  });

  it('blocks acknowledging a comment that does not belong to the report', async () => {
    const { service, repo, prisma } = createService();
    repo.findById.mockResolvedValue({ id: 'report-1', status: ProblemReportStatus.PENDING, referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' });
    prisma.problemReportComment.findUnique.mockResolvedValue({ id: 'comment-1', reportId: 'report-2' });

    await expect(service.acknowledgeComment('report-1', 'comment-1', 'user-1')).rejects.toThrow('Comment does not belong to this report');
  });

  it('reopens only deferred reports and archives using the provided reason', async () => {
    const { service, repo } = createService();
    repo.findById
      .mockResolvedValueOnce({ id: 'report-1', status: ProblemReportStatus.DEFERRED, referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' })
      .mockResolvedValueOnce({ id: 'report-1', status: ProblemReportStatus.PENDING, referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' })
      .mockResolvedValueOnce({ id: 'report-1', status: ProblemReportStatus.ARCHIVED, referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' });

    repo.updateStatus.mockResolvedValue({});

    await service.reopen('report-1', 'user-1');
    await expect(service.archive('report-1', { reason: ReportArchiveReason.MANAGEMENT_DECISION }, 'user-1')).rejects.toThrow('Only PENDING or DEFERRED reports can be archived');
  });

  describe('archive notification content', () => {
    const pendingReport = { id: 'report-1', status: ProblemReportStatus.PENDING, referenceNumber: 'PR-2026-000001', reporterId: 'reporter-1' };

    it('sends a WO-specific message for REPLACED_BY_OTHER_WO with a linked ref', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.REPLACED_BY_OTHER_WO, linkedWorkOrderRef: 'WO-2026-000042' }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Rapport de problème archivé',
          summary: "Votre rapport PR-2026-000001 a été remplacé par l'OT #WO-2026-000042",
        }),
      );
    });

    it('sends a fallback message for REPLACED_BY_OTHER_WO without a linked ref', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.REPLACED_BY_OTHER_WO }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Votre rapport PR-2026-000001 a été remplacé par un autre ordre de travail',
        }),
      );
    });

    it('sends a management-decision message for MANAGEMENT_DECISION', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.MANAGEMENT_DECISION }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Votre rapport PR-2026-000001 a été clôturé suite à une décision interne',
        }),
      );
    });

    it('sends a spontaneous-resolution message for RESOLVED_SPONTANEOUSLY', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.RESOLVED_SPONTANEOUSLY }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "Votre rapport PR-2026-000001 a été archivé : le problème s'est résolu spontanément",
        }),
      );
    });

    it('sends a decommission message for EQUIPMENT_DECOMMISSIONED', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.EQUIPMENT_DECOMMISSIONED }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "Votre rapport PR-2026-000001 a été archivé : l'équipement a été mis hors service",
        }),
      );
    });

    it('sends an error-submission message for SUBMITTED_IN_ERROR', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.SUBMITTED_IN_ERROR }, 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Votre rapport PR-2026-000001 a été archivé : soumis par erreur',
        }),
      );
    });

    it('stores linkedWorkOrderRef in the update when reason is REPLACED_BY_OTHER_WO', async () => {
      const { service, repo, notifications } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.REPLACED_BY_OTHER_WO, linkedWorkOrderRef: 'WO-2026-000042' }, 'user-1');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'report-1',
        ProblemReportStatus.ARCHIVED,
        'user-1',
        expect.objectContaining({ replacedByWorkOrderRef: 'WO-2026-000042' }),
      );
      expect(notifications.notify).toHaveBeenCalledTimes(1);
    });

    it('does not store replacedByWorkOrderRef for non-REPLACED reasons', async () => {
      const { service, repo } = createService();
      repo.findById.mockResolvedValue(pendingReport);
      repo.updateStatus.mockResolvedValue({});

      await service.archive('report-1', { archiveReason: ReportArchiveReason.SUBMITTED_IN_ERROR }, 'user-1');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'report-1',
        ProblemReportStatus.ARCHIVED,
        'user-1',
        expect.not.objectContaining({ replacedByWorkOrderRef: expect.anything() }),
      );
    });
  });
});