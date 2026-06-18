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

  async findLowStockParts(): Promise<Part[]> {

    return this.prisma.$queryRaw<Part[]>`
      SELECT * FROM "Part"
      WHERE "isActive" = true
        AND "minimumStockThreshold" > 0
        AND "currentStock" < "minimumStockThreshold"
      ORDER BY ("minimumStockThreshold" - "currentStock") DESC
    `;
  }

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

  async getCostTrend(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      Array<{ month: Date; total_cost: string }>
    >`
      SELECT
        DATE_TRUNC('month', sm."createdAt") AS month,
        SUM(sm.quantity::numeric * COALESCE(sm."unitCostAtTime", p."unitCost", 0)) AS total_cost
      FROM "StockMovement" sm
      JOIN "Part" p ON p.id = sm."partId"
      WHERE sm.type = 'OUTGOING'
        AND sm."createdAt" >= ${since}
      GROUP BY DATE_TRUNC('month', sm."createdAt")
      ORDER BY month ASC
    `;

    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      totalCost: Number(r.total_cost ?? 0),
    }));
  }

  async getLongWaitingOnHoldRequests(thresholdHours: number) {
    const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        work_order_id: string;
        wo_reference: string;
        part_id: string | null;
        part_name: string | null;
        part_reference: string | null;
        off_catalog_description: string | null;
        quantity_requested: number;
        created_at: Date;
        waiting_hours: string;
      }>
    >`
      SELECT
        pr.id,
        pr."workOrderId"            AS work_order_id,
        wo."referenceNumber"        AS wo_reference,
        pr."partId"                 AS part_id,
        p.name                      AS part_name,
        p."referenceCode"           AS part_reference,
        pr."offCatalogDescription"  AS off_catalog_description,
        pr."quantityRequested"      AS quantity_requested,
        pr."createdAt"              AS created_at,
        EXTRACT(EPOCH FROM (NOW() - pr."createdAt")) / 3600 AS waiting_hours
      FROM "PartRequest" pr
      JOIN "WorkOrder" wo ON wo.id = pr."workOrderId"
      LEFT JOIN "Part" p ON p.id = pr."partId"
      WHERE pr.status = 'PENDING'
        AND wo.status = 'ON_HOLD'
        AND pr."createdAt" <= ${cutoff}
      ORDER BY pr."createdAt" ASC
    `;

    return rows.map((r) => ({
      id: r.id,
      workOrderId: r.work_order_id,
      woReference: r.wo_reference,
      partId: r.part_id ?? null,
      partName: r.part_name ?? null,
      partReference: r.part_reference ?? null,
      offCatalogDescription: r.off_catalog_description ?? null,
      quantityRequested: Number(r.quantity_requested),
      createdAt: r.created_at.toISOString(),
      waitingHours: Math.round(Number(r.waiting_hours)),
    }));
  }

  async getStockAccuracyRate(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    type RawRow = {
      part_id: string;
      part_name: string;
      part_reference: string;
      total_count: bigint;
      adjustment_count: bigint;
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        sm."partId"                                           AS part_id,
        p.name                                                AS part_name,
        p."referenceCode"                                     AS part_reference,
        COUNT(*)                                              AS total_count,
        COUNT(*) FILTER (WHERE sm.type = 'ADJUSTMENT')       AS adjustment_count
      FROM "StockMovement" sm
      JOIN "Part" p ON p.id = sm."partId"
      WHERE sm."createdAt" >= ${since}
      GROUP BY sm."partId", p.name, p."referenceCode"
      HAVING COUNT(*) > 0
      ORDER BY
        (COUNT(*) FILTER (WHERE sm.type = 'ADJUSTMENT'))::float / COUNT(*) DESC,
        COUNT(*) DESC
      LIMIT 20
    `;

    let globalTotal = 0;
    let globalAdjustments = 0;

    const perPart = rows.map((row) => {
      const total = Number(row.total_count);
      const adjustments = Number(row.adjustment_count);
      globalTotal += total;
      globalAdjustments += adjustments;
      const accuracyRate = total === 0 ? 100 : Math.round((1 - adjustments / total) * 1000) / 10;
      return {
        partId: row.part_id,
        partName: row.part_name,
        partReference: row.part_reference,
        totalMovements: total,
        adjustmentMovements: adjustments,
        accuracyRate,
      };
    });

    const globalRate =
      globalTotal === 0 ? 100 : Math.round((1 - globalAdjustments / globalTotal) * 1000) / 10;

    return { globalRate, totalMovements: globalTotal, adjustmentCount: globalAdjustments, perPart };
  }

  async getConsumptionBreakdown(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    type RawRow = {
      part_id: string;
      part_name: string;
      part_reference: string;
      category_id: string | null;
      category_name: string | null;
      wo_type: string | null;
      total_quantity: bigint;
      total_cost: string;
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        sm."partId"                                                                AS part_id,
        p.name                                                                     AS part_name,
        p."referenceCode"                                                          AS part_reference,
        ac.id                                                                      AS category_id,
        ac.name                                                                    AS category_name,
        wo.type                                                                    AS wo_type,
        SUM(sm.quantity)                                                           AS total_quantity,
        SUM(sm.quantity::numeric * COALESCE(sm."unitCostAtTime", p."unitCost", 0)) AS total_cost
      FROM "StockMovement" sm
      JOIN "Part" p ON p.id = sm."partId"
      LEFT JOIN "WorkOrder" wo ON wo.id = sm."workOrderId"
      LEFT JOIN "Asset" a       ON a.id  = wo."assetId"
      LEFT JOIN "AssetCategory" ac ON ac.id = a."categoryId"
      WHERE sm.type = 'OUTGOING'
        AND sm."createdAt" >= ${since}
        AND sm."partId" IN (
          SELECT "partId"
          FROM "StockMovement"
          WHERE type = 'OUTGOING' AND "createdAt" >= ${since}
          GROUP BY "partId"
          ORDER BY SUM(quantity) DESC
          LIMIT 20
        )
      GROUP BY sm."partId", p.name, p."referenceCode", ac.id, ac.name, wo.type
      ORDER BY sm."partId", ac.name NULLS LAST, wo.type NULLS LAST
    `;

    const partMap = new Map<
      string,
      {
        partId: string;
        partName: string;
        partReference: string;
        totalQuantity: number;
        totalCost: number;
        byAssetCategory: Map<
          string,
          {
            categoryId: string | null;
            categoryName: string | null;
            quantity: number;
            cost: number;
            byWoType: Array<{ woType: string | null; quantity: number; cost: number }>;
          }
        >;
      }
    >();

    for (const row of rows) {
      const qty = Number(row.total_quantity);
      const cost = Number(row.total_cost ?? 0);
      const catKey = row.category_id ?? '__none__';

      if (!partMap.has(row.part_id)) {
        partMap.set(row.part_id, {
          partId: row.part_id,
          partName: row.part_name,
          partReference: row.part_reference,
          totalQuantity: 0,
          totalCost: 0,
          byAssetCategory: new Map(),
        });
      }
      const part = partMap.get(row.part_id)!;
      part.totalQuantity += qty;
      part.totalCost += cost;

      if (!part.byAssetCategory.has(catKey)) {
        part.byAssetCategory.set(catKey, {
          categoryId: row.category_id,
          categoryName: row.category_name,
          quantity: 0,
          cost: 0,
          byWoType: [],
        });
      }
      const cat = part.byAssetCategory.get(catKey)!;
      cat.quantity += qty;
      cat.cost += cost;
      cat.byWoType.push({ woType: row.wo_type, quantity: qty, cost });
    }

    return [...partMap.values()]
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .map((part) => ({
        partId: part.partId,
        partName: part.partName,
        partReference: part.partReference,
        totalQuantity: part.totalQuantity,
        totalCost: part.totalCost,
        byAssetCategory: [...part.byAssetCategory.values()].map((cat) => ({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          quantity: cat.quantity,
          cost: cat.cost,
          byWoType: cat.byWoType,
        })),
      }));
  }

  async getUnitCostTrendPerPart(periodDays: number) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    type RawRow = {
      part_id: string;
      part_name: string;
      part_reference: string;
      month: Date;
      avg_unit_cost: string;
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        p.id                                          AS part_id,
        p.name                                        AS part_name,
        p."referenceCode"                             AS part_reference,
        DATE_TRUNC('month', sm."createdAt")           AS month,
        AVG(sm."unitCostAtTime")                      AS avg_unit_cost
      FROM "StockMovement" sm
      JOIN "Part" p ON p.id = sm."partId"
      WHERE sm.type = 'INCOMING'
        AND sm."unitCostAtTime" IS NOT NULL
        AND sm."createdAt" >= ${since}
      GROUP BY p.id, p.name, p."referenceCode", DATE_TRUNC('month', sm."createdAt")
      ORDER BY p.name ASC, month ASC
    `;

    const byPart = new Map<
      string,
      { partName: string; partReference: string; trend: { month: string; avgUnitCost: number }[] }
    >();

    for (const row of rows) {
      if (!byPart.has(row.part_id)) {
        byPart.set(row.part_id, { partName: row.part_name, partReference: row.part_reference, trend: [] });
      }
      byPart.get(row.part_id)!.trend.push({
        month: row.month.toISOString().slice(0, 7),
        avgUnitCost: Math.round(Number(row.avg_unit_cost) * 100) / 100,
      });
    }

    return Array.from(byPart.entries()).map(([partId, { partName, partReference, trend }]) => ({
      partId,
      partName,
      partReference,
      trend,
    }));
  }
}
