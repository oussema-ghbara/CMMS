import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderSource,
  WorkOrderPriority,
  StockMovementType,
  Prisma,
} from '@gmao/db';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { WorkOrderQueryDto } from './dto/work-order-query.dto';
import { nextWorkOrderReference } from '../common/reference-number.util';

@Injectable()
export class WorkOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: WorkOrderQueryDto): Promise<{ data: WorkOrder[]; total: number }> {
    const { search, status, type, priority, assetId, technicianId, page = 1, limit = 20, closedAfter, closedBefore, isOverdue, isActive } = query;

    const NON_TERMINAL_STATUSES = [
      WorkOrderStatus.DRAFT,
      WorkOrderStatus.OPEN,
      WorkOrderStatus.ASSIGNED,
      WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.ON_HOLD,
      WorkOrderStatus.PENDING_VALIDATION,
    ];

    const ACTIVE_STATUSES = [
      WorkOrderStatus.ASSIGNED,
      WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.ON_HOLD,
    ];

    const where: Prisma.WorkOrderWhereInput = {
      ...(search && {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { status }),
      ...(type && { type }),
      ...(priority && { priority }),
      ...(assetId && { assetId }),
      ...(technicianId && { assignments: { some: { technicianId, isActive: true } } }),
      ...((closedAfter || closedBefore) && {
        closedAt: {
          ...(closedAfter && { gte: new Date(closedAfter) }),
          ...(closedBefore && { lte: new Date(closedBefore) }),
        },
      }),
      ...(isOverdue && {
        dueDate: { not: null, lt: new Date() },
        status: { in: NON_TERMINAL_STATUSES },
      }),
      ...(isActive && {
        status: { in: ACTIVE_STATUSES },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        include: {
          asset: {
            select: {
              id: true, name: true, qrCodeIdentifier: true, status: true,
              location: { select: { fullPath: true } },
            },
          },
          principalTechnician: { select: { id: true, name: true } },
          assignments: {
            where: { isActive: true },
            include: { technician: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string): Promise<WorkOrder> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        asset: { include: { location: true, category: true } },
        principalTechnician: { select: { id: true, name: true } },
        assignments: {
          include: {
            technician: { select: { id: true, name: true } },
            blockFlags: { where: { isResolved: false } },
          },
        },
        interventionLogs: {
          include: {
            actions: true,
            offListParts: true,
            technician: { select: { id: true, name: true } },
          },
          orderBy: { startedAt: 'asc' },
        },
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        statusLogs: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
        validationActions: { orderBy: { createdAt: 'desc' } },
        onHoldPeriods: { orderBy: { startedAt: 'desc' } },
        partRequests: {
          include: { part: { select: { id: true, name: true, referenceCode: true } } },
        },
        stockMovements: {
          where: { type: StockMovementType.OUTGOING },
          select: {
            id: true,
            type: true,
            quantity: true,
            unitCostAtTime: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        sourceReport: {
          select: {
            id: true,
            referenceNumber: true,
            description: true,
            urgencyPerception: true,
            reporter: { select: { id: true, name: true } },
            createdAt: true,
          },
        },
        followUpFrom: { select: { id: true, referenceNumber: true } },
        followUps: { select: { id: true, referenceNumber: true } },
      },
    });
    if (!wo) throw new NotFoundException(`Work order ${id} not found`);
    return wo;
  }

  async create(
    dto: CreateWorkOrderDto,
    actorId: string,
    source: WorkOrderSource,
    capturedLocationPath: string,
    sourceReportId?: string,
    sourcePlanId?: string,
    followUpFromId?: string,
  ): Promise<WorkOrder> {
    return this.prisma.$transaction(async (tx) => {
      const referenceNumber = await nextWorkOrderReference(tx);

      const status = WorkOrderStatus.DRAFT;

      const wo = await tx.workOrder.create({
        data: {
          referenceNumber,
          type: dto.type,
          status,
          priority: dto.priority,
          sourceType: source,
          description: dto.description,
          internalNotes: dto.internalNotes,
          capturedLocationPath,
          estimatedDurationMinutes: dto.estimatedDurationMinutes,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          assetId: dto.assetId,
          sourceReportId,
          sourcePlanId,
          followUpFromId,
          createdById: actorId,
        },
      });

      await tx.workOrderStatusLog.create({
        data: { workOrderId: wo.id, toStatus: status, actorId, label: 'Created' },
      });

      // Assignments are created exclusively through the assign endpoint (OPEN → ASSIGNED).
      // A freshly created WO is always DRAFT — no technician assignment at this stage.

      return wo;
    });
  }

  async updateStatus(
    id: string,
    toStatus: WorkOrderStatus,
    actorId: string,
    label?: string,
    additionalData?: Prisma.WorkOrderUpdateInput,
  ): Promise<WorkOrder> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findUniqueOrThrow({ where: { id } });

      const updated = await tx.workOrder.update({
        where: { id },
        data: { status: toStatus, ...additionalData },
      });

      await tx.workOrderStatusLog.create({
        data: { workOrderId: id, fromStatus: current.status, toStatus, actorId, label },
      });

      return updated;
    });
  }

  async updatePriority(
    id: string,
    toPriority: WorkOrder['priority'],
    actorId: string | null,
    isAutoEscalation: boolean,
  ): Promise<WorkOrder> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findUniqueOrThrow({ where: { id } });

      const updated = await tx.workOrder.update({
        where: { id },
        data: { priority: toPriority },
      });

      await tx.workOrderPriorityLog.create({
        data: {
          workOrderId: id,
          fromPriority: current.priority,
          toPriority,
          ...(actorId ? { actorId } : {}),
          isAutoEscalation,
        },
      });

      return updated;
    });
  }

  findOverdueForEscalation(now: Date): Promise<Array<Pick<WorkOrder, 'id' | 'priority' | 'referenceNumber'>>> {
    // §4.3: escalation only applies to WOs that have NOT yet started (OPEN or ASSIGNED).
    // IN_PROGRESS, ON_HOLD, and PENDING_VALIDATION are explicitly excluded — the technician
    // is already working on these and escalating would contradict the operational model.
    return this.prisma.workOrder.findMany({
      where: {
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED] },
        dueDate: { not: null, lt: now },
        priority: { not: WorkOrderPriority.CRITICAL },
      },
      select: { id: true, priority: true, referenceNumber: true },
    });
  }

  // §4.3: CRITICAL WOs that become overdue do not escalate further but trigger an
  // immediate supervisor notification.
  findOverdueCritical(now: Date): Promise<Array<Pick<WorkOrder, 'id' | 'referenceNumber'>>> {
    return this.prisma.workOrder.findMany({
      where: {
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED] },
        dueDate: { not: null, lt: now },
        priority: WorkOrderPriority.CRITICAL,
      },
      select: { id: true, referenceNumber: true },
    });
  }
}
