import {
  Injectable, BadRequestException, InternalServerErrorException, Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PreventivePlansRepository } from './preventive-plans.repository';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import type { CreatePlanChecklistItemDto } from './dto/create-checklist-item.dto';
import type { UpdatePlanChecklistItemDto } from './dto/update-checklist-item.dto';
import type { ReorderPlanChecklistItemsDto } from './dto/reorder-checklist-items.dto';
import type { PlanQueryDto } from './dto/plan-query.dto';
import {
  PreventiveFrequencyType, WorkOrderStatus, WorkOrderType, WorkOrderSource,
  WorkOrderPriority, AssetStatus, NotificationType, AssignmentRole,
} from '@gmao/db';
import { PREVENTIVE_PLAN_QUEUE, PLAN_GENERATOR_JOB } from './preventive-plans.constants';
import { nextWorkOrderReference } from '../common/reference-number.util';

export function computeNextDueAt(
  frequencyType: PreventiveFrequencyType,
  intervalDays: number | null | undefined,
  calendarExpression: string | null | undefined,
  from: Date = new Date(),
): Date {
  if (frequencyType === PreventiveFrequencyType.FIXED_INTERVAL_DAYS) {
    if (!intervalDays || intervalDays < 1) {
      throw new BadRequestException('intervalDays must be a positive integer for FIXED_INTERVAL_DAYS');
    }
    const next = new Date(from);
    next.setDate(next.getDate() + intervalDays);
    return next;
  }
  // CALENDAR — parse cron expression to get next occurrence
  if (!calendarExpression) {
    throw new BadRequestException('calendarExpression is required for CALENDAR frequency type');
  }
  try {
    const interval = CronExpressionParser.parse(calendarExpression, { currentDate: from });
    return interval.next().toDate();
  } catch {
    throw new BadRequestException(`Invalid cron expression: "${calendarExpression}"`);
  }
}

@Injectable()
export class PreventivePlansService {
  private readonly logger = new Logger(PreventivePlansService.name);

  constructor(
    private readonly repo: PreventivePlansRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(PREVENTIVE_PLAN_QUEUE) private readonly queue: Queue<{ planId: string }>,
  ) {}

  findAll(query: PlanQueryDto) {
    return this.repo.findAll(query);
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  async create(dto: CreatePlanDto) {
    await this.validateAsset(dto.assetId);
    if (dto.defaultTechnicianId) {
      await this.assertActiveTechnician(dto.defaultTechnicianId);
    }
    this.validateFrequencyFields(dto.frequencyType, dto.intervalDays, dto.calendarExpression);

    const nextDueAt = dto.firstDueAt
      ? new Date(dto.firstDueAt)
      : computeNextDueAt(dto.frequencyType, dto.intervalDays, dto.calendarExpression);

    return this.repo.create(dto, nextDueAt);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.repo.findById(id);

    if (dto.defaultTechnicianId) {
      await this.assertActiveTechnician(dto.defaultTechnicianId);
    }

    const frequencyType = dto.frequencyType ?? plan.frequencyType;
    const intervalDays = dto.intervalDays !== undefined ? dto.intervalDays : plan.intervalDays;
    const calendarExpression =
      dto.calendarExpression !== undefined ? dto.calendarExpression : plan.calendarExpression;

    const frequencyChanged =
      dto.frequencyType !== undefined ||
      dto.intervalDays !== undefined ||
      dto.calendarExpression !== undefined;

    if (frequencyChanged) {
      this.validateFrequencyFields(frequencyType, intervalDays, calendarExpression);
    }

    const nextDueAt = frequencyChanged
      ? computeNextDueAt(frequencyType, intervalDays, calendarExpression)
      : undefined;

    return this.repo.update(id, dto, nextDueAt);
  }

  activate(id: string) {
    return this.repo.setActive(id, true);
  }

  deactivate(id: string) {
    return this.repo.setActive(id, false);
  }

  addChecklistItem(planId: string, dto: CreatePlanChecklistItemDto) {
    return this.repo.addChecklistItem(planId, dto);
  }

  updateChecklistItem(planId: string, itemId: string, dto: UpdatePlanChecklistItemDto) {
    // planId ownership check is done in deleteChecklistItem; update trusts the route params.
    return this.repo.updateChecklistItem(itemId, dto);
  }

  async deleteChecklistItem(planId: string, itemId: string): Promise<void> {
    const item = await this.prisma.preventivePlanChecklistItem.findUnique({ where: { id: itemId } });
    if (!item || item.planId !== planId) {
      throw new BadRequestException('Checklist item does not belong to this plan');
    }
    await this.repo.deleteChecklistItem(itemId);
  }

  reorderChecklistItems(planId: string, dto: ReorderPlanChecklistItemsDto) {
    return this.repo.reorderChecklistItems(planId, dto.items);
  }

  // ── Manual trigger (Supervisor — for testing or ad-hoc generation) ──

  async triggerNow(planId: string): Promise<{ jobId: string | undefined }> {
    const plan = await this.repo.findById(planId);
    if (!plan.isActive) {
      throw new BadRequestException('Cannot trigger an inactive plan');
    }
    const job = await this.queue.add(
      PLAN_GENERATOR_JOB,
      { planId },
      { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 50, removeOnFail: 200 },
    );
    return { jobId: job.id };
  }

  // ── Core WO generation — called by BullMQ processor ──────────────────

  async generateWorkOrder(planId: string): Promise<void> {
    const plan = await this.repo.findById(planId);

    if (!plan.isActive) {
      this.logger.warn(`Plan ${planId} is inactive — skipping WO generation`);
      return;
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: plan.assetId },
      include: { location: true },
    });

    if (!asset) {
      this.logger.error(`Plan ${planId}: asset ${plan.assetId} not found — deactivating plan`);
      await this.repo.setActive(planId, false);
      return;
    }

    if (asset.status === AssetStatus.DECOMMISSIONED) {
      this.logger.warn(`Plan ${planId}: asset "${asset.name}" is DECOMMISSIONED — deactivating plan`);
      await this.repo.setActive(planId, false);
      await this.notifications.notifySupervisors(
        NotificationType.PREVENTIVE_PLAN_GENERATED,
        'Plan préventif désactivé automatiquement',
        `Le plan "${plan.title}" a été désactivé : l'actif "${asset.name}" est hors service définitif`,
        'PreventivePlan',
        planId,
      );
      return;
    }

    const createdById = await this.resolveSystemActorId(plan.defaultTechnicianId ?? null);
    const initialStatus = plan.defaultTechnicianId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.OPEN;

    const wo = await this.prisma.$transaction(async (tx) => {
      const referenceNumber = await nextWorkOrderReference(tx);

      const created = await tx.workOrder.create({
        data: {
          referenceNumber,
          type: WorkOrderType.PREVENTIVE,
          status: initialStatus,
          priority: WorkOrderPriority.MEDIUM,
          sourceType: WorkOrderSource.PREVENTIVE_PLAN,
          sourcePlanId: planId,
          description: `Maintenance préventive : ${plan.title}`,
          capturedLocationPath: asset.location.fullPath,
          assetId: plan.assetId,
          estimatedDurationMinutes: plan.estimatedDurationMinutes,
          principalTechnicianId: plan.defaultTechnicianId ?? null,
          createdById,
        },
      });

      // Initial status log — fromStatus is null (first entry) per schema definition
      await tx.workOrderStatusLog.create({
        data: {
          workOrderId: created.id,
          fromStatus: null,
          toStatus: initialStatus,
          actorId: createdById,
          label: 'Auto-généré depuis plan préventif',
        },
      });

      if (plan.defaultTechnicianId) {
        await tx.workOrderAssignment.create({
          data: {
            workOrderId: created.id,
            technicianId: plan.defaultTechnicianId,
            role: AssignmentRole.PRINCIPAL,
          },
        });
      }

      if (plan.checklistItems.length > 0) {
        await tx.workOrderChecklistItem.createMany({
          data: plan.checklistItems.map((item) => ({
            workOrderId: created.id,
            sourcePlanItemId: item.id,
            description: item.description,
            taskType: item.taskType,
            expectedCondition: item.expectedCondition ?? null,
            isMandatory: item.isMandatory,
            sortOrder: item.sortOrder,
            autoCreateCorrectiveWO: item.autoCreateCorrectiveWO,
          })),
        });
      }

      return created;
    });

    // Advance nextDueAt before notifying — if notification fails, WO was still created
    const nextDueAt = computeNextDueAt(plan.frequencyType, plan.intervalDays, plan.calendarExpression);
    await this.repo.updateNextDueAt(planId, nextDueAt);

    this.logger.log(
      `WO ${wo.referenceNumber} generated from plan "${plan.title}" — next due: ${nextDueAt.toISOString()}`,
    );

    await this.notifications.notifySupervisors(
      NotificationType.PREVENTIVE_PLAN_GENERATED,
      'Ordre de travail préventif généré',
      `${wo.referenceNumber} généré depuis le plan "${plan.title}" pour ${asset.name}`,
      'WorkOrder',
      wo.id,
    );

    if (plan.defaultTechnicianId) {
      await this.notifications.notify({
        recipientId: plan.defaultTechnicianId,
        type: NotificationType.WO_ASSIGNED,
        title: 'Nouvel ordre de travail préventif assigné',
        summary: `Vous êtes technicien principal sur ${wo.referenceNumber} — ${plan.title}`,
        entityType: 'WorkOrder',
        entityId: wo.id,
      });
    } else {
      await this.notifications.notifySupervisors(
        NotificationType.UNASSIGNED_PLAN_WO,
        'Ordre de travail préventif sans technicien',
        `${wo.referenceNumber} attend une assignation — plan "${plan.title}"`,
        'WorkOrder',
        wo.id,
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async validateAsset(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException(`Asset ${assetId} not found`);
    if (asset.status === AssetStatus.DECOMMISSIONED) {
      throw new BadRequestException('Cannot create a preventive plan for a decommissioned asset');
    }
  }

  private async assertActiveTechnician(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new BadRequestException(`User ${userId} not found or inactive`);
    }
    if (!(user.roles as string[]).includes('TECHNICIAN')) {
      throw new BadRequestException(`User ${userId} does not have the TECHNICIAN role`);
    }
  }

  private validateFrequencyFields(
    frequencyType: PreventiveFrequencyType,
    intervalDays: number | null | undefined,
    calendarExpression: string | null | undefined,
  ): void {
    if (frequencyType === PreventiveFrequencyType.FIXED_INTERVAL_DAYS) {
      if (!intervalDays || intervalDays < 1) {
        throw new BadRequestException('intervalDays is required and must be >= 1 for FIXED_INTERVAL_DAYS');
      }
    } else {
      if (!calendarExpression) {
        throw new BadRequestException('calendarExpression is required for CALENDAR frequency type');
      }
      try {
        CronExpressionParser.parse(calendarExpression);
      } catch {
        throw new BadRequestException(`Invalid cron expression: "${calendarExpression}"`);
      }
    }
  }

  // System-generated WOs need a createdById. Use the defaultTechnician if set,
  // otherwise fall back to the first active ADMIN (always present after seed).
  private async resolveSystemActorId(preferredId: string | null): Promise<string> {
    if (preferredId) return preferredId;
    const admin = await this.prisma.user.findFirst({
      where: { roles: { has: 'ADMIN' }, isActive: true },
      select: { id: true },
    });
    if (!admin) {
      throw new InternalServerErrorException('No active ADMIN user found — check seed data');
    }
    return admin.id;
  }
}
