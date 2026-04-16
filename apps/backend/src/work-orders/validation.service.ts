import { WorkOrder } from '@gmao/db';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportGenerationJobService } from './jobs/report-generation-job.service';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { ValidateWorkOrderDto } from './dto/validate-work-order.dto';
import { WorkOrderStatus, AssetStatus, NotificationType, Role } from '@gmao/db';
import { InterventionResult } from '@gmao/shared';
import { assertTransitionAllowed } from './work-orders.state-machine';

@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
    private readonly notifications: NotificationsService,
    private readonly reportGenerationJob: ReportGenerationJobService,
  ) {}

  async validate(woId: string, actorId: string, dto: ValidateWorkOrderDto = {}): Promise<WorkOrder> {
    const wo = await this.repo.findById(woId);
    assertTransitionAllowed(wo.status, WorkOrderStatus.CLOSED, [Role.SUPERVISOR]);

    // Determine whether the last completed intervention reported COULD_NOT_INTERVENE.
    // We look for the most recent log that has a result recorded (endedAt IS NOT NULL).
    const lastCompletedLog = (wo as any).interventionLogs
      ?.filter((l: { endedAt: Date | null; result: string | null }) => l.endedAt !== null && l.result !== null)
      .sort(
        (a: { endedAt: Date }, b: { endedAt: Date }) =>
          new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
      )[0] ?? null;

    const isCouldNotIntervene =
      lastCompletedLog?.result === InterventionResult.COULD_NOT_INTERVENE;

    if (isCouldNotIntervene && !dto.assetStatusOverride) {
      throw new BadRequestException(
        'The technician reported COULD_NOT_INTERVENE. ' +
        'The supervisor must explicitly provide assetStatusOverride to acknowledge ' +
        'that the asset was not repaired and choose its post-validation status.',
      );
    }

    const resolvedAssetStatus: AssetStatus = isCouldNotIntervene
      ? dto.assetStatusOverride!
      : AssetStatus.OPERATIONAL;

    const statusLogLabel = isCouldNotIntervene
      ? `Validated with COULD_NOT_INTERVENE acknowledged — asset set to ${resolvedAssetStatus}`
      : 'Work order validated and closed';

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
        data: {
          workOrderId: woId,
          fromStatus: wo.status,
          toStatus: WorkOrderStatus.CLOSED,
          actorId,
          label: statusLogLabel,
        },
      });
      await tx.workOrderValidation.create({
        data: { workOrderId: woId, action: 'APPROVED', validatorId: actorId },
      });
      await tx.asset.update({ where: { id: wo.assetId }, data: { status: resolvedAssetStatus } });
      await tx.assetStatusLog.create({
        data: {
          assetId: wo.assetId,
          fromStatus: asset.status,
          toStatus: resolvedAssetStatus,
          actorId,
          workOrderId: woId,
          reason: statusLogLabel,
        },
      });
    });

    // When the technician could not intervene, notify the principal technician
    // so that a follow-up intervention can be planned.
    if (isCouldNotIntervene && wo.principalTechnicianId) {
      await this.notifications.notify({
        recipientId: wo.principalTechnicianId,
        type: NotificationType.FOLLOW_UP_PROMPT,
        title: 'Intervention non réalisée — suivi requis',
        summary:
          `L'ordre de travail ${wo.referenceNumber} a été clôturé avec le résultat ` +
          `"Intervention non réalisée". L'équipement est désormais en statut ` +
          `${resolvedAssetStatus}. Un suivi peut être nécessaire.`,
        entityType: 'WorkOrder',
        entityId: woId,
      });
    }

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
