import { WorkOrder } from '@gmao/db';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportGenerationJobService } from './jobs/report-generation-job.service';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { WorkOrderStatus, AssetStatus, NotificationType, Role } from '@gmao/db';
import { assertTransitionAllowed } from './work-orders.state-machine';

@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
    private readonly notifications: NotificationsService,
    private readonly reportGenerationJob: ReportGenerationJobService,
  ) {}

  async validate(woId: string, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    assertTransitionAllowed(wo.status, WorkOrderStatus.CLOSED, [Role.SUPERVISOR]);

    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: wo.assetId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: woId },
        data: {
          status: WorkOrderStatus.CLOSED,
          validatedById: actorId,
          validatedAt: new Date(),
          closedAt: new Date(),
        },
      });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.CLOSED, actorId },
      });
      await tx.workOrderValidation.create({
        data: { workOrderId: woId, action: 'APPROVED', validatorId: actorId },
      });
      await tx.asset.update({ where: { id: wo.assetId }, data: { status: AssetStatus.OPERATIONAL } });
      await tx.assetStatusLog.create({
        data: {
          assetId: wo.assetId, fromStatus: asset.status,
          toStatus: AssetStatus.OPERATIONAL, actorId, workOrderId: woId,
          reason: 'Work order validated and closed',
        },
      });
    });

    // Enqueue PDF report generation job (fire-and-forget)
    // This runs asynchronously after the WO is successfully closed
    void this.reportGenerationJob.enqueueReportGeneration(woId);

    return this.repo.findById(woId);
  }

  async reject(woId: string, dto: RejectValidationDto, actorId: string): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    assertTransitionAllowed(wo.status, WorkOrderStatus.IN_PROGRESS, [Role.SUPERVISOR]);

    const technician = wo.principalTechnicianId
      ? await this.prisma.user.findUnique({
          where: { id: wo.principalTechnicianId },
          select: { hourlyRate: true },
        })
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id: woId }, data: { status: WorkOrderStatus.IN_PROGRESS } });
      await tx.workOrderStatusLog.create({
        data: {
          workOrderId: woId, fromStatus: wo.status, toStatus: WorkOrderStatus.IN_PROGRESS,
          actorId, label: `Validation rejected: ${dto.rejectionReason}`,
        },
      });
      await tx.workOrderValidation.create({
        data: {
          workOrderId: woId, action: 'REJECTED',
          rejectionReason: dto.rejectionReason, rejectionDetail: dto.rejectionDetail,
          validatorId: actorId,
        },
      });
      if (wo.principalTechnicianId) {
        await tx.interventionLog.create({
          data: {
            workOrderId: woId,
            technicianId: wo.principalTechnicianId,
            hourlyRateAtTime: technician?.hourlyRate ?? null,
          },
        });
      }
    });

    if (wo.principalTechnicianId) {
      await this.notifications.notify({
        recipientId: wo.principalTechnicianId,
        type: NotificationType.CLOSURE_REJECTED,
        title: 'Closure rejected',
        summary: `Your closure for ${wo.referenceNumber} was rejected: ${dto.rejectionReason}`,
        entityType: 'WorkOrder', entityId: woId,
      });
    }

    return this.repo.findById(woId);
  }
}
