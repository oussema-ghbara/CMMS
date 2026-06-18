import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubmitPartRequestDto } from './dto/submit-part-request.dto';
import { FulfillPartRequestDto } from './dto/fulfill-part-request.dto';
import { RejectPartRequestDto } from './dto/reject-part-request.dto';
import { PartRequestQueryDto } from './dto/part-request-query.dto';
import { WorkOrderStatus, PartRequestStatus, NotificationType } from '@gmao/shared';
import { PartRequest } from '@gmao/db';

@Injectable()
export class PartRequestsService {
  constructor(
    private readonly repo: InventoryRepository,
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findByWorkOrder(workOrderId: string) {
    return this.repo.findRequestsByWorkOrder(workOrderId);
  }

  findQueue(query: PartRequestQueryDto) {
    return this.repo.findRequestQueue(query);
  }

  async submit(workOrderId: string, dto: SubmitPartRequestDto, actorId: string) {

    if (!dto.partId && !dto.offCatalogDescription) {
      throw new BadRequestException('Provide either partId (catalog request) or offCatalogDescription (off-catalog request)');
    }
    if (dto.partId && dto.offCatalogDescription) {
      throw new BadRequestException('Provide partId or offCatalogDescription, not both');
    }

    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, referenceNumber: true, status: true },
    });
    if (!wo) throw new NotFoundException(`Work order ${workOrderId} not found`);
    if (wo.status === WorkOrderStatus.CLOSED || wo.status === WorkOrderStatus.CANCELLED) {
      throw new BadRequestException(`Cannot submit a part request for a ${wo.status.toLowerCase()} work order`);
    }

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId, technicianId: actorId, isActive: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You must be actively assigned to this work order to submit part requests');
    }

    let stockWarning: string | undefined;
    if (dto.partId) {
      const part = await this.repo.findPartById(dto.partId);
      if (!part.isActive) {
        throw new BadRequestException(`Part "${part.name}" is inactive and cannot be requested`);
      }
      if (part.currentStock < dto.quantityRequested) {
        stockWarning = `${dto.quantityRequested} requested, only ${part.currentStock} currently in stock`;
      }
    }

    const request = await this.repo.createRequest(
      workOrderId,
      actorId,
      dto.partId,
      dto.offCatalogDescription,
      dto.quantityRequested,
      dto.note,
    );

    const storekeepers = await this.prisma.user.findMany({
      where: { roles: { has: 'STOREKEEPER' }, isActive: true },
      select: { id: true },
    });
    await this.notifications.notifyMany(
      storekeepers.map((s) => ({
        recipientId: s.id,
        type: NotificationType.NEW_PART_REQUEST,
        title: 'New part request',
        summary: `${wo.referenceNumber}: ${dto.partId ? 'catalog request' : 'off-catalog request'} — qty ${dto.quantityRequested}`,
        entityType: 'PartRequest',
        entityId: request.id,
      })),
    );

    return { request, stockWarning };
  }

  async fulfill(requestId: string, dto: FulfillPartRequestDto, actorId: string) {
    const request = await this.repo.findRequestById(requestId);

    if (request.status !== PartRequestStatus.PENDING) {
      throw new BadRequestException(`Part request is already ${request.status.toLowerCase()} and cannot be fulfilled`);
    }

    if (!request.partId) {

      throw new BadRequestException(
        'This is an off-catalog request. Create the part in the catalog first, then re-submit or process it as a return manually.',
      );
    }

    const part = await this.repo.findPartById(request.partId);
    const requested = dto.quantity ?? request.quantityRequested;

    if (part.currentStock === 0) {
      throw new BadRequestException(
        `No stock available for "${part.name}". Reject this request with reason OUT_OF_STOCK.`,
      );
    }

    const toFulfill = Math.min(requested, part.currentStock);
    const isPartial = toFulfill < request.quantityRequested;

    await this.repo.createOutgoingMovement(
      request.partId,
      toFulfill,
      actorId,
      request.workOrderId,
      requestId,
      Number(part.unitCost),
    );

    const newStatus = isPartial ? PartRequestStatus.PARTIALLY_FULFILLED : PartRequestStatus.FULFILLED;
    await this.repo.updateRequestStatus(requestId, newStatus, actorId, {
      quantityFulfilled: toFulfill,
    });

    await this.inventory.checkAndNotifyLowStock(request.partId);

    await this.notifications.notify({
      recipientId: request.requesterId,
      type: NotificationType.PART_REQUEST_FULFILLED,
      title: isPartial ? 'Part request partially fulfilled' : 'Part request fulfilled',
      summary: isPartial
        ? `${toFulfill} of ${request.quantityRequested} units of "${part.name}" dispatched — pick up at: ${part.warehouseLocation ?? 'see storekeeper'}`
        : `${toFulfill} unit(s) of "${part.name}" ready — pick up at: ${part.warehouseLocation ?? 'see storekeeper'}`,
      entityType: 'PartRequest',
      entityId: requestId,
    });

    return this.repo.findRequestById(requestId);
  }

  async reject(requestId: string, dto: RejectPartRequestDto, actorId: string) {
    const request = await this.repo.findRequestById(requestId);

    if (request.status !== PartRequestStatus.PENDING) {
      throw new BadRequestException(`Part request is already ${request.status.toLowerCase()} and cannot be rejected`);
    }

    await this.repo.updateRequestStatus(requestId, PartRequestStatus.REJECTED, actorId, {
      rejectionReason: dto.reason,
      rejectionDetail: dto.detail,
    });

    const partLabel = request.offCatalogDescription
      ?? (request as PartRequest & { part?: { name: string } | null }).part?.name
      ?? 'requested part';

    await this.notifications.notify({
      recipientId: request.requesterId,
      type: NotificationType.PART_REQUEST_REJECTED,
      title: 'Part request rejected',
      summary: `Request for "${partLabel}" rejected: ${dto.reason}${dto.detail ? ` — ${dto.detail}` : ''}`,
      entityType: 'PartRequest',
      entityId: requestId,
    });

    return this.repo.findRequestById(requestId);
  }

  async handleWorkOrderCancellation(workOrderId: string, actorId: string): Promise<void> {

    const pendingRequests = await this.repo.findPendingRequestsForWorkOrder(workOrderId);

    await this.repo.cancelPendingRequestsForWorkOrder(workOrderId, actorId);

    if (pendingRequests.length > 0) {
      const storekeepers = await this.prisma.user.findMany({
        where: { roles: { has: 'STOREKEEPER' }, isActive: true },
        select: { id: true },
      });

      const notifications = pendingRequests.flatMap((req) =>
        storekeepers.map((s) => ({
          recipientId: s.id,
          type: NotificationType.PENDING_REQUEST_CANCELLED,
          title: 'Pending part request cancelled',
          summary: `Work order cancelled — part request for "${
            (req as PartRequest & { part?: { name: string } | null }).part?.name ?? req.offCatalogDescription ?? 'off-catalog item'
          }" (qty ${req.quantityRequested}) has been cancelled`,
          entityType: 'PartRequest',
          entityId: req.id,
        })),
      );

      await this.notifications.notifyMany(notifications);
    }

    const fulfilledRequests = await this.repo.findFulfilledRequestsForWorkOrder(workOrderId);

    if (fulfilledRequests.length > 0) {
      const storekeepers = await this.prisma.user.findMany({
        where: { roles: { has: 'STOREKEEPER' }, isActive: true },
        select: { id: true },
      });

      const notifications = fulfilledRequests.flatMap((req) =>
        storekeepers.map((s) => ({
          recipientId: s.id,
          type: NotificationType.PART_RETURN_PROMPT,
          title: 'Parts return decision required',
          summary: `Work order cancelled — confirm return of "${
            (req as PartRequest & { part?: { name: string } | null }).part?.name ?? 'off-catalog item'
          }" (${req.quantityFulfilled} units) to stock, or record as consumed`,
          entityType: 'PartRequest',
          entityId: req.id,
        })),
      );

      await this.notifications.notifyMany(notifications);
    }
  }
}
