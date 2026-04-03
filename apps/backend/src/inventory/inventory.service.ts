import { Injectable, BadRequestException } from '@nestjs/common';
import { InventoryRepository } from './inventory.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { PartQueryDto } from './dto/part-query.dto';
import { RecordIncomingStockDto } from './dto/record-incoming-stock.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { NotificationType } from '@gmao/shared';
import { Part, StockMovement } from '@gmao/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly repo: InventoryRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Parts ──────────────────────────────────────────────────────────

findAllParts(query: PartQueryDto): Promise<{ data: Part[]; total: number }> {
    return this.repo.findAllParts(query);
  }

  findPartById(id: string): Promise<Part> {
    return this.repo.findPartById(id);
  }

  createPart(dto: CreatePartDto): Promise<Part> {
    return this.repo.createPart(dto);
  }

  updatePart(id: string, dto: UpdatePartDto): Promise<Part> {
    return this.repo.updatePart(id, dto);
  }

  deactivatePart(id: string): Promise<Part> {
    return this.repo.setPartActive(id, false);
  }

  activatePart(id: string): Promise<Part> {
    return this.repo.setPartActive(id, true);
  }

  findLowStockParts(): Promise<Part[]> {
    return this.repo.findLowStockParts();
  }

  findMovementsByPart(partId: string): Promise<StockMovement[]> {
    return this.repo.findMovementsByPart(partId);
  }

  // ── Incoming stock ─────────────────────────────────────────────────

  async recordIncomingStock(dto: RecordIncomingStockDto, actorId: string): Promise<{ part: Part; movement: StockMovement }> {
    const part = await this.repo.findPartById(dto.partId);

    if (!part.isActive) {
      throw new BadRequestException(`Part "${part.name}" is inactive and cannot receive incoming stock`);
    }

    const unitCost = dto.unitCost ?? Number(part.unitCost);

    const { movement } = await this.repo.createIncomingMovement(
      dto.partId,
      dto.quantity,
      actorId,
      unitCost,
      dto.supplierReference,
      dto.receivedDate ? new Date(dto.receivedDate) : undefined,
    );

    // Update catalog unit cost if price changed
    if (dto.unitCost !== undefined && dto.unitCost !== Number(part.unitCost)) {
      await this.prisma.part.update({
        where: { id: dto.partId },
        data: { unitCost: dto.unitCost },
      });
    }

    const freshPart = await this.repo.findPartById(dto.partId);
    return { part: freshPart, movement };
  }

  // ── Stock adjustment ───────────────────────────────────────────────

  async recordAdjustment(dto: StockAdjustmentDto, actorId: string) {
    if (dto.reason === 'OTHER' && !dto.detail) {
      throw new BadRequestException('detail is required when reason is OTHER');
    }

    await this.repo.findPartById(dto.partId);

    return this.repo.createAdjustmentMovement(
      dto.partId,
      dto.quantity,
      actorId,
      dto.reason,
      dto.detail,
    );
  }

  // ── Analytics ──────────────────────────────────────────────────────

  async getAnalytics(periodDays = 30, deadStockDays = 90): Promise<Record<string, unknown>> {
    const [consumption, replenishment, deadStock, requests] = await Promise.all([
      this.repo.getConsumptionAnalytics(periodDays),
      this.repo.getReplenishmentAnalytics(90),
      this.repo.getDeadStockParts(deadStockDays),
      this.repo.getRequestProcessingMetrics(periodDays),
    ]);

    return { periodDays, consumption, replenishment, deadStock, requests };
  }

  // ── Low-stock alert — called after every outgoing movement ─────────

  async checkAndNotifyLowStock(partId: string): Promise<void> {
    const part = await this.prisma.part.findUnique({ where: { id: partId } });
    if (!part || part.minimumStockThreshold === 0) return;
    if (part.currentStock < part.minimumStockThreshold) {
      const storekeepers = await this.prisma.user.findMany({
        where: { roles: { has: 'STOREKEEPER' }, isActive: true },
        select: { id: true },
      });
      await this.notifications.notifyMany(
        storekeepers.map((s) => ({
          recipientId: s.id,
          type: NotificationType.STOCK_BELOW_MINIMUM,
          title: 'Stock below minimum threshold',
          summary: `${part.name} (${part.referenceCode}): ${part.currentStock} in stock, minimum is ${part.minimumStockThreshold}`,
          entityType: 'Part',
          entityId: partId,
        })),
      );
    }
  }
  async recordPartReturn(
    partId: string,
    quantity: number,
    workOrderId: string,
    actorId: string,
  ): Promise<{ part: Part; movement: StockMovement }> {
    await this.repo.findPartById(partId);
    return this.repo.createReturnMovement(partId, quantity, actorId, workOrderId, 'Returned after work order cancellation');
  }

}
