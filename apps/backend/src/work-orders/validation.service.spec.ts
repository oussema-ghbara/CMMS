/**
 * Unit tests for ValidationService
 *
 * Covers:
 * - Normal path (no COULD_NOT_INTERVENE) → asset set to OPERATIONAL
 * - COULD_NOT_INTERVENE with assetStatusOverride provided → asset set to override
 * - COULD_NOT_INTERVENE without assetStatusOverride → BadRequestException
 * - Notification sent to principal technician on CNI path
 * - No notification sent on normal path
 * - State machine guard: wrong current status → BadRequestException
 * - Report generation job always enqueued on success
 * - Transaction contents: WorkOrder, StatusLog, Validation, Asset, AssetStatusLog
 */

import { BadRequestException } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { WorkOrderStatus, AssetStatus, NotificationType } from '@gmao/db';
import { InterventionResult } from '@gmao/shared';
import { Role } from '@gmao/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    referenceNumber: 'WO-2026-001',
    status: WorkOrderStatus.PENDING_VALIDATION,
    assetId: 'asset-1',
    principalTechnicianId: 'tech-1',
    interventionLogs: [],
    ...overrides,
  };
}

function buildInterventionLog(result: string | null, endedAt: Date | null = new Date()) {
  return {
    id: 'log-1',
    endedAt,
    result,
    startedAt: new Date(Date.now() - 3_600_000),
  };
}

function buildAsset(status = AssetStatus.IN_MAINTENANCE) {
  return { id: 'asset-1', status };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  // A minimal Prisma mock that records the calls made inside $transaction
  const txWorkOrderUpdate = jest.fn().mockResolvedValue({});
  const txStatusLogCreate = jest.fn().mockResolvedValue({});
  const txValidationCreate = jest.fn().mockResolvedValue({});
  const txAssetUpdate = jest.fn().mockResolvedValue({});
  const txAssetStatusLogCreate = jest.fn().mockResolvedValue({});

  const tx = {
    workOrder: { update: txWorkOrderUpdate },
    workOrderStatusLog: { create: txStatusLogCreate },
    workOrderValidation: { create: txValidationCreate },
    asset: { update: txAssetUpdate },
    assetStatusLog: { create: txAssetStatusLogCreate },
  };

  type TxShape = typeof tx;

  const prisma: {
    asset: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
    user?: { findUnique: jest.Mock };
  } = {
    asset: {
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: TxShape) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const repo = {
    findById: jest.fn(),
  };

  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
    notifySupervisors: jest.fn().mockResolvedValue(undefined),
  };

  const reportGenerationJob = {
    enqueueReportGeneration: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ValidationService(
    prisma as never,
    repo as never,
    notifications as never,
    reportGenerationJob as never,
  );

  return {
    service,
    prisma,
    repo,
    notifications,
    reportGenerationJob,
    tx: {
      workOrderUpdate: txWorkOrderUpdate,
      statusLogCreate: txStatusLogCreate,
      validationCreate: txValidationCreate,
      assetUpdate: txAssetUpdate,
      assetStatusLogCreate: txAssetStatusLogCreate,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ValidationService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── validate() ─────────────────────────────────────────────────────────────

  describe('validate()', () => {
    describe('Normal path (no COULD_NOT_INTERVENE result)', () => {
      it('sets asset status to OPERATIONAL when last intervention was RESOLVED', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({ interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)] }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OPERATIONAL },
        });
      });

      it('sets asset status to OPERATIONAL when last intervention was PARTIALLY_RESOLVED', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.PARTIALLY_RESOLVED)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OPERATIONAL },
        });
      });

      it('sets asset status to OPERATIONAL when there are no intervention logs at all', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(buildWorkOrder({ interventionLogs: [] }))
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OPERATIONAL },
        });
      });

      it('does NOT send a FOLLOW_UP_PROMPT notification on the normal path', async () => {
        const { service, prisma, repo, notifications } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({ interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)] }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(notifications.notify).not.toHaveBeenCalled();
      });

      it('writes a status log with the standard label', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({ interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)] }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.statusLogCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              label: 'Work order validated and closed',
              toStatus: WorkOrderStatus.CLOSED,
            }),
          }),
        );
      });

      it('enqueues the PDF report generation job', async () => {
        const { service, prisma, repo, reportGenerationJob } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(buildWorkOrder({ interventionLogs: [] }))
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(reportGenerationJob.enqueueReportGeneration).toHaveBeenCalledWith('wo-1');
      });
    });

    // ── COULD_NOT_INTERVENE path ──────────────────────────────────────────────

    describe('COULD_NOT_INTERVENE path', () => {
      it('throws BadRequestException when assetStatusOverride is absent', async () => {
        const { service, repo } = buildMocks();

        repo.findById.mockResolvedValueOnce(
          buildWorkOrder({
            interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
          }),
        );

        await expect(service.validate('wo-1', 'supervisor-1', {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('includes the COULD_NOT_INTERVENE detail in the error message', async () => {
        const { service, repo } = buildMocks();

        repo.findById.mockResolvedValueOnce(
          buildWorkOrder({
            interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
          }),
        );

        await expect(service.validate('wo-1', 'supervisor-1', {})).rejects.toThrow(
          /assetStatusOverride/,
        );
      });

      it('sets asset to OUT_OF_SERVICE when supervisor chooses OUT_OF_SERVICE', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OUT_OF_SERVICE,
        });

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OUT_OF_SERVICE },
        });
      });

      it('sets asset to IN_MAINTENANCE when supervisor chooses IN_MAINTENANCE', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.IN_MAINTENANCE,
        });

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.IN_MAINTENANCE },
        });
      });

      it('allows supervisor to accept risk and set asset to OPERATIONAL on CNI', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OPERATIONAL,
        });

        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OPERATIONAL },
        });
      });

      it('sends FOLLOW_UP_PROMPT notification to the principal technician', async () => {
        const { service, prisma, repo, notifications } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
              principalTechnicianId: 'tech-1',
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OUT_OF_SERVICE,
        });

        expect(notifications.notify).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientId: 'tech-1',
            type: NotificationType.FOLLOW_UP_PROMPT,
            entityType: 'WorkOrder',
            entityId: 'wo-1',
          }),
        );
      });

      it('does NOT send notification when WO has no principal technician', async () => {
        const { service, prisma, repo, notifications } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
              principalTechnicianId: null,
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OUT_OF_SERVICE,
        });

        expect(notifications.notify).not.toHaveBeenCalled();
      });

      it('writes a status log label that names the CNI acknowledgement and chosen status', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OUT_OF_SERVICE,
        });

        expect(tx.statusLogCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              label: expect.stringContaining('COULD_NOT_INTERVENE'),
              toStatus: WorkOrderStatus.CLOSED,
            }),
          }),
        );
      });

      it('uses the most recent completed log — ignores earlier logs', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        // Two logs: first RESOLVED (older), second COULD_NOT_INTERVENE (newer)
        const olderLog = {
          ...buildInterventionLog(InterventionResult.RESOLVED, new Date('2026-04-10T10:00:00Z')),
          id: 'log-old',
        };
        const newerLog = {
          ...buildInterventionLog(
            InterventionResult.COULD_NOT_INTERVENE,
            new Date('2026-04-15T12:00:00Z'),
          ),
          id: 'log-new',
        };

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({ interventionLogs: [olderLog, newerLog] }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        // Without the override, must throw because the newest log is CNI
        await expect(service.validate('wo-1', 'supervisor-1', {})).rejects.toThrow(
          BadRequestException,
        );
      });

      it('ignores incomplete (endedAt=null) intervention logs when determining CNI', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        // An incomplete CNI log (endedAt null) should NOT trigger the CNI guard
        const incompleteLog = buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE, null);

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({ interventionLogs: [incompleteLog] }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        // Should NOT throw because the log is incomplete
        await expect(
          service.validate('wo-1', 'supervisor-1', {}),
        ).resolves.not.toThrow();

        // Should default to OPERATIONAL
        expect(tx.assetUpdate).toHaveBeenCalledWith({
          where: { id: 'asset-1' },
          data: { status: AssetStatus.OPERATIONAL },
        });
      });

      it('still enqueues PDF generation on CNI path', async () => {
        const { service, prisma, repo, reportGenerationJob } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(
            buildWorkOrder({
              interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
            }),
          )
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {
          assetStatusOverride: AssetStatus.OUT_OF_SERVICE,
        });

        expect(reportGenerationJob.enqueueReportGeneration).toHaveBeenCalledWith('wo-1');
      });
    });

    // ── Transaction integrity ─────────────────────────────────────────────────

    describe('Transaction integrity', () => {
      it('closes the work order and records validator in the transaction', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(buildWorkOrder({ interventionLogs: [] }))
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-99', {});

        expect(tx.workOrderUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'wo-1' },
            data: expect.objectContaining({
              status: WorkOrderStatus.CLOSED,
              validatedById: 'supervisor-99',
            }),
          }),
        );
      });

      it('creates an APPROVED WorkOrderValidation record', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(buildWorkOrder({ interventionLogs: [] }))
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.validationCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              workOrderId: 'wo-1',
              action: 'APPROVED',
              validatorId: 'supervisor-1',
            }),
          }),
        );
      });

      it('records the previous asset status in the assetStatusLog', async () => {
        const { service, prisma, repo, tx } = buildMocks();

        repo.findById
          .mockResolvedValueOnce(buildWorkOrder({ interventionLogs: [] }))
          .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

        prisma.asset.findUniqueOrThrow.mockResolvedValue(
          buildAsset(AssetStatus.IN_MAINTENANCE),
        );

        await service.validate('wo-1', 'supervisor-1', {});

        expect(tx.assetStatusLogCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              assetId: 'asset-1',
              fromStatus: AssetStatus.IN_MAINTENANCE,
              toStatus: AssetStatus.OPERATIONAL,
              workOrderId: 'wo-1',
            }),
          }),
        );
      });
    });

    // ── State machine guard ───────────────────────────────────────────────────

    describe('State machine guard', () => {
      it('rejects when the work order is already CLOSED', async () => {
        const { service, repo } = buildMocks();

        repo.findById.mockResolvedValue(
          buildWorkOrder({ status: WorkOrderStatus.CLOSED, interventionLogs: [] }),
        );

        await expect(service.validate('wo-1', 'supervisor-1', {})).rejects.toThrow();
      });

      it('rejects when the work order is IN_PROGRESS (not yet submitted)', async () => {
        const { service, repo } = buildMocks();

        repo.findById.mockResolvedValue(
          buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS, interventionLogs: [] }),
        );

        await expect(service.validate('wo-1', 'supervisor-1', {})).rejects.toThrow();
      });
    });
  });

  // ── reject() ──────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('transitions the work order back to IN_PROGRESS', async () => {
      const { service, prisma, repo } = buildMocks();

      // Spy on the real transaction by capturing calls
      let capturedData: Record<string, unknown> = {};
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txSpy = {
            workOrder: {
              update: jest.fn().mockImplementation((args: Record<string, unknown>) => {
                capturedData = args as Record<string, unknown>;
                return {};
              }),
            },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            interventionLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return fn(txSpy);
        },
      );

      repo.findById
        .mockResolvedValueOnce(
          buildWorkOrder({ status: WorkOrderStatus.PENDING_VALIDATION, principalTechnicianId: null }),
        )
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS }));

      prisma.user = { findUnique: jest.fn().mockResolvedValue(null) };

      await service.reject('wo-1', { rejectionReason: 'INCOMPLETE_CHECKLIST' as never }, 'supervisor-1');

      expect(capturedData).toMatchObject({
        where: { id: 'wo-1' },
        data: { status: WorkOrderStatus.IN_PROGRESS },
      });
    });

    it('sends a CLOSURE_REJECTED notification when principal technician exists', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      // Override $transaction to supply a tx mock that includes interventionLog
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        async (fn: (t: Record<string, unknown>) => Promise<unknown>) => {
          const txSpy = {
            workOrder: { update: jest.fn().mockResolvedValue({}) },
            workOrderStatusLog: { create: jest.fn().mockResolvedValue({}) },
            workOrderValidation: { create: jest.fn().mockResolvedValue({}) },
            interventionLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return fn(txSpy);
        },
      );

      repo.findById
        .mockResolvedValueOnce(
          buildWorkOrder({
            status: WorkOrderStatus.PENDING_VALIDATION,
            principalTechnicianId: 'tech-5',
          }),
        )
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS }));

      prisma.user = {
        findUnique: jest.fn().mockResolvedValue({ hourlyRate: null }),
      };

      await service.reject(
        'wo-1',
        { rejectionReason: 'INSUFFICIENT_DESCRIPTION' as never },
        'supervisor-1',
      );

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'tech-5',
          type: NotificationType.CLOSURE_REJECTED,
        }),
      );
    });

    it('does NOT send a notification when the WO has no principal technician', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      repo.findById
        .mockResolvedValueOnce(
          buildWorkOrder({
            status: WorkOrderStatus.PENDING_VALIDATION,
            principalTechnicianId: null,
          }),
        )
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.IN_PROGRESS }));

      (prisma as any).user = { findUnique: jest.fn().mockResolvedValue(null) };

      await service.reject(
        'wo-1',
        { rejectionReason: 'OTHER' as never },
        'supervisor-1',
      );

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  // ── LINKED_WO_CLOSED notification (§1.3) ───────────────────────────────────

  describe('validate() — LINKED_WO_CLOSED notification', () => {
    it('notifies the requester when the WO was created from a problem report', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      const woWithReport = buildWorkOrder({
        interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)],
        sourceReport: { reporter: { id: 'requester-1', name: 'Ahmed Ben Ali' } },
      });

      repo.findById
        .mockResolvedValueOnce(woWithReport)
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

      prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

      await service.validate('wo-1', 'supervisor-1', {});

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'requester-1',
          type: NotificationType.LINKED_WO_CLOSED,
          entityType: 'WorkOrder',
          entityId: 'wo-1',
        }),
      );
    });

    it('does NOT notify when the WO has no source report', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      repo.findById
        .mockResolvedValueOnce(
          buildWorkOrder({
            interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)],
            sourceReport: null,
          }),
        )
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

      prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

      await service.validate('wo-1', 'supervisor-1', {});

      const linkedWoClosedCalls = (notifications.notify as jest.Mock).mock.calls.filter(
        (call: [{ type: string }]) => call[0].type === NotificationType.LINKED_WO_CLOSED,
      );
      expect(linkedWoClosedCalls).toHaveLength(0);
    });

    it('sends LINKED_WO_CLOSED even on COULD_NOT_INTERVENE path when source report exists', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      const woWithReport = buildWorkOrder({
        interventionLogs: [buildInterventionLog(InterventionResult.COULD_NOT_INTERVENE)],
        principalTechnicianId: 'tech-1',
        sourceReport: { reporter: { id: 'requester-1', name: 'Requester' } },
      });

      repo.findById
        .mockResolvedValueOnce(woWithReport)
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

      prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

      await service.validate('wo-1', 'supervisor-1', { assetStatusOverride: AssetStatus.OUT_OF_SERVICE });

      const linkedWoClosedCalls = (notifications.notify as jest.Mock).mock.calls.filter(
        (call: [{ type: string }]) => call[0].type === NotificationType.LINKED_WO_CLOSED,
      );
      expect(linkedWoClosedCalls).toHaveLength(1);
      expect(linkedWoClosedCalls[0][0].recipientId).toBe('requester-1');
    });

    it('includes the WO reference number in the summary', async () => {
      const { service, prisma, repo, notifications } = buildMocks();

      repo.findById
        .mockResolvedValueOnce(
          buildWorkOrder({
            interventionLogs: [buildInterventionLog(InterventionResult.RESOLVED)],
            sourceReport: { reporter: { id: 'requester-1', name: 'Requester' } },
          }),
        )
        .mockResolvedValueOnce(buildWorkOrder({ status: WorkOrderStatus.CLOSED }));

      prisma.asset.findUniqueOrThrow.mockResolvedValue(buildAsset());

      await service.validate('wo-1', 'supervisor-1', {});

      const linkedWoClosedCall = (notifications.notify as jest.Mock).mock.calls.find(
        (call: [{ type: string }]) => call[0].type === NotificationType.LINKED_WO_CLOSED,
      );
      expect(linkedWoClosedCall?.[0].summary).toContain('WO-2026-001');
    });
  });
});
