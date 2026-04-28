import { WorkOrder } from '@gmao/db';
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { SubmitClosureDto } from './dto/submit-closure.dto';
import {
  WorkOrderStatus, AssetStatus, NotificationType, Role,
  WorkOrderSource, WorkOrderType, ChecklistItemStatus,
} from '@gmao/db';
import { assertTransitionAllowed } from './work-orders.state-machine';
import { nextWorkOrderReference } from '../common/reference-number.util';

@Injectable()
export class InterventionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async start(woId: string, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);

    if (wo.principalTechnicianId !== actorId) {
      throw new ForbiddenException('Only the principal technician can start this work order');
    }
    assertTransitionAllowed(wo.status, WorkOrderStatus.IN_PROGRESS, [Role.TECHNICIAN]);

    // Simultaneous maintenance guard
    const existingActive = await this.prisma.workOrder.findFirst({
      where: { assetId: wo.assetId, status: WorkOrderStatus.IN_PROGRESS, id: { not: woId } },
    });
    if (existingActive && !wo.simultaneousMaintenanceAuthorized) {
      throw new BadRequestException(
        `Asset already has an active work order (${existingActive.referenceNumber}). Supervisor must authorize simultaneous maintenance on this work order.`,
      );
    }

    const [asset, technician] = await Promise.all([
      this.prisma.asset.findUniqueOrThrow({ where: { id: wo.assetId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { hourlyRate: true } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id: woId }, data: { status: WorkOrderStatus.IN_PROGRESS } });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.IN_PROGRESS, actorId },
      });
      await tx.interventionLog.create({
        data: { workOrderId: woId, technicianId: actorId, hourlyRateAtTime: technician.hourlyRate },
      });
      await tx.asset.update({ where: { id: wo.assetId }, data: { status: AssetStatus.IN_MAINTENANCE } });
      await tx.assetStatusLog.create({
        data: {
          assetId: wo.assetId, fromStatus: asset.status,
          toStatus: AssetStatus.IN_MAINTENANCE, actorId, workOrderId: woId,
          reason: 'Work order started',
        },
      });
    });

    return this.repo.findById(woId);
  }

  async submitClosure(woId: string, dto: SubmitClosureDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);

    if (wo.principalTechnicianId !== actorId) {
      throw new ForbiddenException('Only the principal technician can submit closure');
    }
    assertTransitionAllowed(wo.status, WorkOrderStatus.PENDING_VALIDATION, [Role.TECHNICIAN]);

    const pendingMandatory = await this.prisma.workOrderChecklistItem.count({
      where: { workOrderId: woId, isMandatory: true, status: 'PENDING' },
    });
    if (pendingMandatory > 0) {
      throw new BadRequestException(
        `${pendingMandatory} mandatory checklist item(s) must be completed before closure`,
      );
    }

    const [technician, anomalyItems, asset] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { hourlyRate: true } }),
      this.prisma.workOrderChecklistItem.findMany({
        where: {
          workOrderId: woId,
          status: ChecklistItemStatus.ANOMALY_DETECTED,
          autoCreateCorrectiveWO: true,
        },
        select: { id: true, description: true },
      }),
      this.prisma.asset.findUniqueOrThrow({
        where: { id: wo.assetId },
        select: { location: { select: { fullPath: true } } },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      const activeLog = await tx.interventionLog.findFirst({
        where: { workOrderId: woId, technicianId: actorId, endedAt: null },
      });

      if (activeLog) {
        const durationMinutes =
          dto.activeDurationMinutes ??
          Math.floor((Date.now() - activeLog.startedAt.getTime()) / 60_000);

        await tx.interventionLog.update({
          where: { id: activeLog.id },
          data: {
            endedAt: new Date(),
            activeDurationMinutes: durationMinutes,
            hourlyRateAtTime: technician.hourlyRate,
            result: dto.result,
            resultExplanation: dto.resultExplanation,
          },
        });

        if (dto.actions?.length) {
          await tx.interventionAction.createMany({
            data: dto.actions.map((a) => ({ interventionId: activeLog.id, ...a })),
          });
        }
      }

      await tx.workOrder.update({ where: { id: woId }, data: { status: WorkOrderStatus.PENDING_VALIDATION } });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.PENDING_VALIDATION, actorId },
      });

      for (const item of anomalyItems) {
        const referenceNumber = await nextWorkOrderReference(tx);
        await tx.workOrder.create({
          data: {
            referenceNumber,
            type: WorkOrderType.CORRECTIVE,
            status: WorkOrderStatus.OPEN,
            priority: wo.priority,
            sourceType: WorkOrderSource.CHECKLIST_ANOMALY,
            description: `Auto-created: anomaly on checklist item "${item.description}"`,
            capturedLocationPath: asset.location.fullPath,
            assetId: wo.assetId,
            triggeredByChecklistItemId: item.id,
            sourcePlanId: (wo as any).sourcePlanId ?? undefined,
            createdById: actorId,
          },
        });
      }
    });

    await this.notifications.notifySupervisors(
      NotificationType.WO_PENDING_VALIDATION,
      'Work order pending validation',
      `${wo.referenceNumber} has been submitted for validation`,
      'WorkOrder', woId,
    );

    return this.repo.findById(woId);
  }
}
