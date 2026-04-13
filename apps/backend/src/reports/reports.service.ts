import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportsRepository } from './reports.repository';
import {
  AssetStatus,
  NotificationType,
  ProblemReportStatus,
  WorkOrderType,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderSource,
} from '@gmao/db';
import { ReportQueryDto } from './dto/report-query.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ConvertToWoDto } from './dto/convert-to-wo.dto';
import { RejectReportDto } from './dto/reject-report.dto';
import { DeferReportDto } from './dto/defer-report.dto';
import { ArchiveReportDto } from './dto/archive-report.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { nextProblemReportReference, nextWorkOrderReference } from '../common/reference-number.util';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll(query: ReportQueryDto) {
    return this.repo.findAll(query);
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  async submit(dto: CreateReportDto, actorId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new BadRequestException(`Asset ${dto.assetId} not found`);
    if (asset.status === AssetStatus.DECOMMISSIONED) {
      throw new BadRequestException('Cannot submit a report for a decommissioned asset');
    }
    const report = await this.prisma.$transaction(async (tx) => {
      const referenceNumber = await nextProblemReportReference(tx);
      return tx.problemReport.create({
        data: {
          referenceNumber,
          assetId: dto.assetId,
          reporterId: actorId,
          description: dto.description,
          urgencyPerception: dto.urgencyPerception,
        },
      });
    });
    await this.notifications.notifySupervisors(
      NotificationType.NEW_PROBLEM_REPORT,
      'New problem report',
      `${report.referenceNumber} — ${dto.urgencyPerception.replace(/_/g, ' ')}`,
      'ProblemReport',
      report.id,
    );
    return report;
  }

  async addComment(reportId: string, dto: AddCommentDto, actorId: string) {
    await this.repo.findById(reportId);
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { roles: true } });
    const comment = await this.repo.addComment(reportId, actorId, dto.content);
    const isSupervisor = actor?.roles?.includes('SUPERVISOR') ?? false;
    if (!isSupervisor) {
      await this.notifications.notifySupervisors(
        NotificationType.REQUESTER_COMMENT_ADDED,
        'New comment on problem report',
        `A comment has been added to report — view the report for details`,
        'ProblemReport',
        reportId,
      );
    }
    return comment;
  }

  async acknowledgeComment(reportId: string, commentId: string, actorId: string) {
    const report = await this.repo.findById(reportId);
    const comment = await this.prisma.problemReportComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.reportId !== reportId) {
      throw new BadRequestException('Comment does not belong to this report');
    }
    const updated = await this.repo.acknowledgeComment(commentId);
    await this.notifications.notify({
      recipientId: report.reporterId,
      type: NotificationType.REPORT_CONFIRMED,
      title: 'Report acknowledged',
      summary: `A supervisor has acknowledged your comment on report ${report.referenceNumber}`,
      entityType: 'ProblemReport',
      entityId: reportId,
    });
    void actorId;
    return updated;
  }

  async convert(reportId: string, dto: ConvertToWoDto, actorId: string) {
    const report = await this.repo.findById(reportId);
    if (report.status !== ProblemReportStatus.PENDING) {
      throw new BadRequestException(`Only PENDING reports can be converted. Current status: ${report.status}`);
    }
    const asset = await this.prisma.asset.findUnique({ where: { id: report.assetId }, include: { location: true } });
    if (!asset) throw new BadRequestException(`Asset ${report.assetId} not found`);
    if (asset.status === AssetStatus.DECOMMISSIONED) {
      throw new BadRequestException('Cannot convert a report for a decommissioned asset into a work order');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const referenceNumber = await nextWorkOrderReference(tx);
      const workOrder = await tx.workOrder.create({
        data: {
          referenceNumber,
          type: WorkOrderType.CORRECTIVE,
          status: WorkOrderStatus.DRAFT,
          priority: dto.priority ?? WorkOrderPriority.MEDIUM,
          sourceType: WorkOrderSource.PROBLEM_REPORT,
          sourceReportId: report.id,
          description: dto.description ?? report.description,
          internalNotes: dto.internalNotes,
          capturedLocationPath: asset.location.fullPath,
          estimatedDurationMinutes: dto.estimatedDurationMinutes,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          assetId: report.assetId,
          createdById: actorId,
        },
      });
      await tx.workOrderStatusLog.create({
        data: { workOrderId: workOrder.id, toStatus: WorkOrderStatus.DRAFT, actorId, label: 'Created from problem report' },
      });
      const updatedReport = await tx.problemReport.update({
        where: { id: reportId },
        data: {
          status: ProblemReportStatus.CONVERTED,
          processedById: actorId,
          processedAt: new Date(),
          replacedByWorkOrderRef: referenceNumber,
        },
      });
      return { workOrder, report: updatedReport };
    });
    await this.notifications.notify({
      recipientId: report.reporterId,
      type: NotificationType.REPORT_CONVERTED_TO_WO,
      title: 'Report converted to work order',
      summary: `Your report has been converted to work order ${result.workOrder.referenceNumber}`,
      entityType: 'ProblemReport',
      entityId: reportId,
    });
    return result;
  }

  async reject(reportId: string, dto: RejectReportDto, actorId: string) {
    const report = await this.repo.findById(reportId);
    if (report.status !== ProblemReportStatus.PENDING) {
      throw new BadRequestException(`Only PENDING reports can be rejected. Current status: ${report.status}`);
    }
    await this.repo.updateStatus(reportId, ProblemReportStatus.REJECTED, actorId, {
      rejectionReason: dto.reason,
      rejectionDetail: dto.detail,
    });
    await this.notifications.notify({
      recipientId: report.reporterId,
      type: NotificationType.REPORT_REJECTED,
      title: 'Problem report rejected',
      summary: `Your report ${report.referenceNumber} has been rejected: ${dto.reason.replace(/_/g, ' ')}${dto.detail ? ` — ${dto.detail}` : ''}`,
      entityType: 'ProblemReport',
      entityId: reportId,
    });
    return this.repo.findById(reportId);
  }

  async defer(reportId: string, dto: DeferReportDto, actorId: string) {
    const report = await this.repo.findById(reportId);
    if (report.status !== ProblemReportStatus.PENDING) {
      throw new BadRequestException(`Only PENDING reports can be deferred. Current status: ${report.status}`);
    }
    await this.repo.updateStatus(reportId, ProblemReportStatus.DEFERRED, actorId, {
      deferNote: dto.note,
      deferredAt: new Date(),
    });
    return this.repo.findById(reportId);
  }

  async reopen(reportId: string, actorId: string) {
    const report = await this.repo.findById(reportId);
    if (report.status !== ProblemReportStatus.DEFERRED) {
      throw new BadRequestException(`Only DEFERRED reports can be reopened. Current status: ${report.status}`);
    }
    await this.repo.updateStatus(reportId, ProblemReportStatus.PENDING, actorId);
    return this.repo.findById(reportId);
  }

  async archive(reportId: string, dto: ArchiveReportDto, actorId: string) {
    const report = await this.repo.findById(reportId);
    if (report.status !== ProblemReportStatus.PENDING && report.status !== ProblemReportStatus.DEFERRED) {
      throw new BadRequestException(`Only PENDING or DEFERRED reports can be archived. Current status: ${report.status}`);
    }
    await this.repo.updateStatus(reportId, ProblemReportStatus.ARCHIVED, actorId, {
      archiveReason: dto.archiveReason ?? dto.reason,
    });
    await this.notifications.notify({
      recipientId: report.reporterId,
      type: NotificationType.REPORT_ARCHIVED,
      title: 'Problem report archived',
      summary: `Your report ${report.referenceNumber} has been archived`,
      entityType: 'ProblemReport',
      entityId: reportId,
    });
    return this.repo.findById(reportId);
  }
}
