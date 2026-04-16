import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Part, PartRequest, StockMovement, Prisma, PartRequestStatus, StockMovementType, StockAdjustmentReason, PartRequestRejectionReason } from '@gmao/db';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { PartQueryDto } from './dto/part-query.dto';
import { PartRequestQueryDto } from './dto/part-request-query.dto';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Parts ──────────────────────────────────────────────────────────

  async findAllParts(query: PartQueryDto): Promise<{ data: Part[]; total: number }> {
    const { search, isActive, page = 1, limit = 20 } = query;

    const where: Prisma.PartWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { referenceCode: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(isActive !== undefined && { isActive }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.part.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.part.count({ where }),
    ]);

    return { data, total };
  }

  async findPartById(id: string): Promise<Part> {
    const part = await this.prisma.part.findUnique({ where: { id } });
    if (!part) throw new NotFoundException(`Part ${id} not found`);
    return part;
  }

  async findPartByReferenceCode(referenceCode: string): Promise<Part | null> {
    return this.prisma.part.findUnique({ where: { referenceCode } });
  }

  async createPart(dto: CreatePartDto): Promise<Part> {
    const existing = await this.prisma.part.findUnique({ where: { referenceCode: dto.referenceCode } });
    if (existing) {
      throw new ConflictException(
        `A part with reference code "${dto.referenceCode}" already exists${existing.isActive ? '' : ' (inactive)'}`,
      );
    }

    try {
      return await this.prisma.part.create({
        data: {
          name: dto.name,
          referenceCode: dto.referenceCode,
          description: dto.description,
          unit: dto.unit,
          minimumStockThreshold: dto.minimumStockThreshold ?? 0,
          warehouseLocation: dto.warehouseLocation,
          unitCost: dto.unitCost ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `A part with reference code "${dto.referenceCode}" already exists`,
        );
      }

      throw error;
    }
  }

  async updatePart(id: string, dto: UpdatePartDto): Promise<Part> {
    await this.findPartById(id);

    if (dto.referenceCode) {
      const conflict = await this.prisma.part.findUnique({ where: { referenceCode: dto.referenceCode } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          `A part with reference code "${dto.referenceCode}" already exists${conflict.isActive ? '' : ' (inactive)'}`,
        );
      }
    }

    return this.prisma.part.update({ where: { id }, data: dto });
  }

  async setPartActive(id: string, isActive: boolean): Promise<Part> {
    await this.findPartById(id);
    return this.prisma.part.update({ where: { id }, data: { isActive } });
  }

  // ── Low-stock query (column comparison — requires raw SQL) ──────────

  async findLowStockParts(): Promise<Part[]> {
    // Prisma does not support column-to-column comparisons in where clauses.
    // $queryRaw is safe here — no user input interpolated.
    return this.prisma.$queryRaw<Part[]>`
      SELECT * FROM "Part"
      WHERE "isActive" = true
        AND "minimumStockThreshold" > 0
        AND "currentStock" < "minimumStockThreshold"
      ORDER BY ("minimumStockThreshold" - "currentStock") DESC
    `;
  }

  // ── Stock movements ────────────────────────────────────────────────

  async findMovementsByPart(partId: string): Promise<StockMovement[]> {
    await this.findPartById(partId);
    return this.prisma.stockMovement.findMany({
      where: { partId },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { id: true, name: true } } },
    });
  }

  async createIncomingMovement(
    partId: string,
    quantity: number,
    performedById: string,
    unitCostAtTime: number,
    supplierReference?: string,
    receivedDate?: Date,
  ): Promise<{ part: Part; movement: StockMovement }> {
    return this.prisma.$transaction(async (tx) => {
      const part = await tx.part.update({
        where: { id: partId },
        data: { currentStock: { increment: quantity } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          partId,
          type: StockMovementType.INCOMING,
          quantity,
          unitCostAtTime,
          supplierReference,
          receivedDate: receivedDate ?? new Date(),
          performedById,
        },
      });

      return { part, movement };
    });
  }

  async createAdjustmentMovement(
    partId: string,
    quantity: number,
    performedById: string,
    reason: string,
    detail?: string,
  ): Promise<{ part: Part; movement: StockMovement }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.part.findUniqueOrThrow({ where: { id: partId } });
      const newStock = current.currentStock + quantity;

      if (newStock < 0) {
        throw new BadRequestException(
          `Adjustment of ${quantity} would make stock negative (current: ${current.currentStock}). Use a value >= ${-current.currentStock}.`,
        );
      }

      const part = await tx.part.update({
        where: { id: partId },
        data: { currentStock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          partId,
          type: StockMovementType.ADJUSTMENT,
          quantity,
          isPositiveAdjustment: quantity > 0,
          adjustmentReason: reason as StockAdjustmentReason,
          adjustmentDetail: detail,
          performedById,
        },
      });

      return { part, movement };
    });
  }

  async createOutgoingMovement(
    partId: string,
    quantity: number,
    performedById: string,
    workOrderId: string,
    partRequestId: string,
    unitCostAtTime: number,
  ): Promise<Part> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.part.findUniqueOrThrow({ where: { id: partId } });
      if (current.currentStock < quantity) {
        throw new BadRequestException(
          `Insufficient stock: ${quantity} requested, ${current.currentStock} available`,
        );
      }

      const part = await tx.part.update({
        where: { id: partId },
        data: { currentStock: { decrement: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          partId,
          type: StockMovementType.OUTGOING,
          quantity,
          unitCostAtTime,
          workOrderId,
          partRequestId,
          performedById,
        },
      });

      return part;
    });
  }

  async createReturnMovement(
    partId: string,
    quantity: number,
    performedById: string,
    workOrderId: string,
    note: string,
  ): Promise<{ part: Part; movement: StockMovement }> {
    return this.prisma.$transaction(async (tx) => {
      const part = await tx.part.update({
        where: { id: partId },
        data: { currentStock: { increment: quantity } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          partId,
          type: StockMovementType.RETURN,
          quantity,
          workOrderId,
          note,
          performedById,
        },
      });

      return { part, movement };
    });
  }

  // ── Part Requests ──────────────────────────────────────────────────

  async findRequestsByWorkOrder(workOrderId: string): Promise<PartRequest[]> {
    return this.prisma.partRequest.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
      include: {
        part: { select: { id: true, name: true, referenceCode: true, warehouseLocation: true } },
        requester: { select: { id: true, name: true } },
      },
    });
  }

  async findRequestQueue(query: PartRequestQueryDto): Promise<{ data: PartRequest[]; total: number }> {
    const { status, workOrderId, page = 1, limit = 20 } = query;

    const where: Prisma.PartRequestWhereInput = {
      ...(status && { status }),
      ...(workOrderId && { workOrderId }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.partRequest.findMany({
        where,
        orderBy: [
          { workOrder: { priority: 'asc' } },
          { createdAt: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          part: { select: { id: true, name: true, referenceCode: true, currentStock: true, warehouseLocation: true } },
          requester: { select: { id: true, name: true } },
          workOrder: {
            select: {
              id: true,
              referenceNumber: true,
              priority: true,
              status: true,
              asset: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.partRequest.count({ where }),
    ]);

    return { data, total };
  }

  async findRequestById(id: string): Promise<PartRequest> {
    const request = await this.prisma.partRequest.findUnique({
      where: { id },
      include: {
        part: true,
        workOrder: { select: { id: true, referenceNumber: true, status: true } },
        requester: { select: { id: true, name: true } },
      },
    });
    if (!request) throw new NotFoundException(`Part request ${id} not found`);
    return request;
  }

  async createRequest(
    workOrderId: string,
    requesterId: string,
    partId: string | undefined,
    offCatalogDescription: string | undefined,
    quantityRequested: number,
    note: string | undefined,
  ): Promise<PartRequest> {
    return this.prisma.partRequest.create({
      data: {
        workOrderId,
        requesterId,
        partId,
        offCatalogDescription,
        quantityRequested,
        note,
      },
      include: {
        part: { select: { id: true, name: true, referenceCode: true, currentStock: true } },
        requester: { select: { id: true, name: true } },
      },
    });
  }

  async updateRequestStatus(
    id: string,
    status: PartRequestStatus,
    processedById: string,
    extra?: {
      quantityFulfilled?: number;
      rejectionReason?: string;
      rejectionDetail?: string;
    },
  ): Promise<PartRequest> {
    return this.prisma.partRequest.update({
      where: { id },
      data: {
        status,
        processedById,
        processedAt: new Date(),
        ...(extra?.quantityFulfilled !== undefined && { quantityFulfilled: extra.quantityFulfilled }),
        ...(extra?.rejectionReason && { rejectionReason: extra.rejectionReason as PartRequestRejectionReason }),
        ...(extra?.rejectionDetail && { rejectionDetail: extra.rejectionDetail }),
      },
    });
  }

  async findPendingRequestsForWorkOrder(workOrderId: string): Promise<PartRequest[]> {
    return this.prisma.partRequest.findMany({
      where: { workOrderId, status: PartRequestStatus.PENDING },
      include: { part: { select: { id: true, name: true, referenceCode: true } } },
    });
  }

  async findFulfilledRequestsForWorkOrder(workOrderId: string): Promise<PartRequest[]> {
    return this.prisma.partRequest.findMany({
      where: {
        workOrderId,
        status: { in: [PartRequestStatus.FULFILLED, PartRequestStatus.PARTIALLY_FULFILLED] },
      },
      include: { part: { select: { id: true, name: true, referenceCode: true } } },
    });
  }

  async cancelPendingRequestsForWorkOrder(
    workOrderId: string,
    processedById: string,
  ): Promise<number> {
    const result = await this.prisma.partRequest.updateMany({
      where: { workOrderId, status: PartRequestStatus.PENDING },
      data: {
        status: PartRequestStatus.REJECTED,
        rejectionReason: 'OTHER',
        rejectionDetail: 'Work order cancelled',
        processedById,
        processedAt: new Date(),
      },
    });
    return result.count;
  }

  // ── Analytics ──────────────────────────────────────────────────────

  async getConsumptionAnalytics(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const byPart = await this.prisma.stockMovement.groupBy({
      by: ['partId'],
      where: { type: StockMovementType.OUTGOING, createdAt: { gte: since } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 20,
    });

    const partIds = byPart.map((r) => r.partId);
    const parts = partIds.length
      ? await this.prisma.part.findMany({
          where: { id: { in: partIds } },
          select: { id: true, name: true, referenceCode: true, unitCost: true },
        })
      : [];

    const partMap = new Map(parts.map((p) => [p.id, p]));

    const topByQuantity = byPart.map((r) => ({
      part: partMap.get(r.partId),
      totalQuantity: r._sum.quantity ?? 0,
    }));

    const topByCost = [...topByQuantity]
      .map((r) => ({
        part: r.part,
        totalCost: r.totalQuantity * Number(r.part?.unitCost ?? 0),
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    return { topByQuantity, topByCost };
  }

  async getReplenishmentAnalytics(windowDays = 90) {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Count how many times each part crossed below its minimum threshold
    // Approximated by counting distinct OUTGOING movements that left stock below threshold
    // Using raw SQL for the column comparison
    const replenishmentEvents = (await this.prisma.$queryRaw`
      SELECT sm."partId" AS part_id, p.name AS part_name, p."referenceCode" AS part_reference, COUNT(*) AS times_below
      FROM "StockMovement" sm
      JOIN "Part" p ON p.id = sm."partId"
      WHERE sm.type = 'OUTGOING'
        AND sm."createdAt" >= ${since}
        AND p."minimumStockThreshold" > 0
      GROUP BY sm."partId", p.name, p."referenceCode"
      ORDER BY times_below DESC
      LIMIT 20
    `) as Array<{ part_id: string; part_name: string; part_reference: string; times_below: bigint }>;

    return replenishmentEvents.map((r) => ({
      partId: r.part_id,
      partName: r.part_name,
      partReference: r.part_reference,
      timesTriggered: Number(r.times_below),
    }));
  }

  async getDeadStockParts(thresholdDays: number): Promise<Part[]> {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    return this.prisma.$queryRaw<Part[]>`
      SELECT p.* FROM "Part" p
      WHERE p."isActive" = true
        AND p."currentStock" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "StockMovement" sm
          WHERE sm."partId" = p.id
            AND sm.type = 'OUTGOING'
            AND sm."createdAt" >= ${cutoff}
        )
      ORDER BY p.name
    `;
  }

  async getRequestProcessingMetrics(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [total, fulfilled, partial, rejected] = await this.prisma.$transaction([
      this.prisma.partRequest.count({ where: { createdAt: { gte: since } } }),
      this.prisma.partRequest.count({ where: { createdAt: { gte: since }, status: PartRequestStatus.FULFILLED } }),
      this.prisma.partRequest.count({ where: { createdAt: { gte: since }, status: PartRequestStatus.PARTIALLY_FULFILLED } }),
      this.prisma.partRequest.count({ where: { createdAt: { gte: since }, status: PartRequestStatus.REJECTED } }),
    ]);

    const avgProcessingMs = await this.prisma.$queryRaw<Array<{ avg_ms: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("processedAt" - "createdAt")) * 1000) AS avg_ms
      FROM "PartRequest"
      WHERE "createdAt" >= ${since}
        AND "processedAt" IS NOT NULL
    `;

    return {
      total,
      fulfilled,
      partiallyFulfilled: partial,
      rejected,
      pending: total - fulfilled - partial - rejected,
      fulfilmentRate: total > 0 ? ((fulfilled + partial) / total) * 100 : 0,
      avgProcessingMinutes: avgProcessingMs[0]?.avg_ms
        ? Math.round(Number(avgProcessingMs[0].avg_ms) / 60_000)
        : null,
    };
  }
}
