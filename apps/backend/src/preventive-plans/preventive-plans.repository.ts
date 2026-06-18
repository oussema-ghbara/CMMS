import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PreventivePlan, PreventivePlanChecklistItem } from '@gmao/db';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import type { CreatePlanChecklistItemDto } from './dto/create-checklist-item.dto';
import type { UpdatePlanChecklistItemDto } from './dto/update-checklist-item.dto';
import type { PlanQueryDto } from './dto/plan-query.dto';

const PLAN_INCLUDE = {
  asset: { select: { id: true, name: true, qrCodeIdentifier: true, status: true } },
  defaultTechnician: { select: { id: true, name: true, email: true } },
  checklistItems: { orderBy: { sortOrder: 'asc' as const } },
} as const;

type AssetSummary = { id: string; name: string; qrCodeIdentifier: string; status: string };
type TechnicianSummary = { id: string; name: string; email: string };

type PlanWithRelations = PreventivePlan & {
  checklistItems: PreventivePlanChecklistItem[];
  asset: AssetSummary;
  defaultTechnician: TechnicianSummary | null;
};

@Injectable()
export class PreventivePlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PlanQueryDto): Promise<{ data: PlanWithRelations[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.assetId ? { assetId: query.assetId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.preventivePlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PLAN_INCLUDE,
      }),
      this.prisma.preventivePlan.count({ where }),
    ]);

    return { data: data as unknown as PlanWithRelations[], total };
  }

  async findById(id: string): Promise<PlanWithRelations> {
    const plan = await this.prisma.preventivePlan.findUnique({
      where: { id },
      include: PLAN_INCLUDE,
    });
    if (!plan) throw new NotFoundException(`Preventive plan ${id} not found`);
    return plan as unknown as PlanWithRelations;
  }

  async create(dto: CreatePlanDto, nextDueAt: Date): Promise<PlanWithRelations> {
    return this.prisma.preventivePlan.create({
      data: {
        assetId: dto.assetId,
        title: dto.title,
        description: dto.description,
        frequencyType: dto.frequencyType,
        intervalDays: dto.intervalDays,
        calendarExpression: dto.calendarExpression,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        defaultTechnicianId: dto.defaultTechnicianId,
        nextDueAt,
        isActive: true,
      },
      include: PLAN_INCLUDE,
    }) as unknown as PlanWithRelations;
  }

  async update(id: string, dto: UpdatePlanDto, nextDueAt?: Date): Promise<PlanWithRelations> {
    await this.findById(id);
    return this.prisma.preventivePlan.update({
      where: { id },
      data: {
        ...dto,
        ...(nextDueAt !== undefined ? { nextDueAt } : {}),
      },
      include: PLAN_INCLUDE,
    }) as unknown as PlanWithRelations;
  }

  async setActive(id: string, isActive: boolean): Promise<PlanWithRelations> {
    await this.findById(id);
    return this.prisma.preventivePlan.update({
      where: { id },
      data: { isActive },
      include: PLAN_INCLUDE,
    }) as unknown as PlanWithRelations;
  }

  async updateNextDueAt(id: string, nextDueAt: Date): Promise<void> {
    await this.prisma.preventivePlan.update({ where: { id }, data: { nextDueAt } });
  }

  async findDuePlans(): Promise<PlanWithRelations[]> {
    const plans = await this.prisma.preventivePlan.findMany({
      where: { isActive: true, nextDueAt: { lte: new Date() } },
      include: PLAN_INCLUDE,
    });
    return plans as unknown as PlanWithRelations[];
  }

  async findSameDayAssetConflicts(
    duePlans: PlanWithRelations[],
  ): Promise<Map<string, Array<{ planId: string; planTitle: string; assetName: string }>>> {
    const conflicts = new Map<string, Array<{ planId: string; planTitle: string; assetName: string }>>();

    const byAsset = new Map<string, typeof duePlans>();
    for (const plan of duePlans) {
      if (!byAsset.has(plan.assetId)) {
        byAsset.set(plan.assetId, []);
      }
      byAsset.get(plan.assetId)!.push(plan);
    }

    for (const [assetId, plans] of byAsset.entries()) {
      if (plans.length >= 2) {
        conflicts.set(
          assetId,
          plans.map((p) => ({
            planId: p.id,
            planTitle: p.title,
            assetName: p.asset.name,
          })),
        );
      }
    }

    return conflicts;
  }

  async addChecklistItem(planId: string, dto: CreatePlanChecklistItemDto): Promise<PreventivePlanChecklistItem> {
    await this.findById(planId);
    return this.prisma.preventivePlanChecklistItem.create({
      data: {
        planId,
        description: dto.description,
        taskType: dto.taskType,
        expectedCondition: dto.expectedCondition,
        isMandatory: dto.isMandatory ?? false,
        sortOrder: dto.sortOrder ?? 0,
        autoCreateCorrectiveWO: dto.autoCreateCorrectiveWO ?? false,
      },
    });
  }

  async updateChecklistItem(itemId: string, dto: UpdatePlanChecklistItemDto): Promise<PreventivePlanChecklistItem> {
    const item = await this.prisma.preventivePlanChecklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist template item ${itemId} not found`);
    return this.prisma.preventivePlanChecklistItem.update({ where: { id: itemId }, data: dto });
  }

  async deleteChecklistItem(itemId: string): Promise<void> {
    const item = await this.prisma.preventivePlanChecklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist template item ${itemId} not found`);
    await this.prisma.preventivePlanChecklistItem.delete({ where: { id: itemId } });
  }

  async reorderChecklistItems(planId: string, items: { id: string; sortOrder: number }[]): Promise<void> {
    await this.findById(planId);
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.preventivePlanChecklistItem.update({ where: { id }, data: { sortOrder } }),
      ),
    );
  }
}
