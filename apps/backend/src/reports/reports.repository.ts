import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProblemReportStatus, WorkOrderStatus, CertificateStatus } from '@gmao/db';
import { ReportQueryDto } from './dto/report-query.dto';
import { CreateReportDto } from './dto/create-report.dto';

const TERMINAL_STATUSES = [WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED] as const;
const ALERT_CERT_STATUSES = [CertificateStatus.EXPIRING_SOON, CertificateStatus.EXPIRED] as const;

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ReportQueryDto) {
    const { search, status, assetId, reporterId, urgencyPerception, page = 1, limit = 20 } = query;
    const where: any = {
      ...(search && {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { status }),
      ...(assetId && { assetId }),
      ...(reporterId && { reporterId }),
      ...(urgencyPerception && { urgencyPerception }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.problemReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, location: { select: { fullPath: true } } } },
        },
        orderBy: [{ urgencyPerception: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.problemReport.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    const report = await this.prisma.problemReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true } },
        processedBy: { select: { id: true, name: true } },
        asset: {
          include: {
            location: true,

            workOrders: {
              where: { status: { notIn: [...TERMINAL_STATUSES] } },
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                type: true,
                description: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },

            certificates: {
              where: { isArchived: false, status: { in: [...ALERT_CERT_STATUSES] } },
              select: {
                id: true,
                certificateType: true,
                otherType: true,
                status: true,
                expirationDate: true,
                issuingAuthority: true,
              },
              orderBy: { expirationDate: 'asc' },
            },
          },
        },
        comments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        derivedWorkOrders: {
          select: { id: true, referenceNumber: true, status: true, createdAt: true },
        },
      },
    });

    if (!report) throw new NotFoundException(`Problem report ${id} not found`);

    const assetInterventionHistory = await this.prisma.workOrder.findMany({
      where: {
        assetId: report.assetId,
        status: WorkOrderStatus.CLOSED,
        closedAt: { not: null },
      },
      orderBy: { closedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        referenceNumber: true,
        type: true,
        closedAt: true,
        description: true,
        principalTechnician: { select: { id: true, name: true } },
      },
    });

    return { ...report, assetInterventionHistory };
  }

  async create(dto: CreateReportDto, actorId: string, referenceNumber: string) {
    return this.prisma.problemReport.create({
      data: {
        referenceNumber,
        assetId: dto.assetId,
        reporterId: actorId,
        description: dto.description,
        urgencyPerception: dto.urgencyPerception,
        submittedDespiteWarning: dto.submittedDespiteWarning ?? false,
      },
    });
  }

  async updateStatus(id: string, status: ProblemReportStatus, actorId: string, extraData?: Record<string, any>) {
    return this.prisma.problemReport.update({
      where: { id },
      data: { status, processedById: actorId, processedAt: new Date(), ...extraData },
    });
  }

  async addComment(reportId: string, authorId: string, content: string) {
    return this.prisma.problemReportComment.create({
      data: { reportId, authorId, content },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async acknowledgeComment(commentId: string) {
    return this.prisma.problemReportComment.update({
      where: { id: commentId },
      data: { acknowledgedBySupervisor: true },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async findReportsDeferredInWindow(minHours: number, maxHours: number) {
    const now = new Date();
    const lowerBound = new Date(now.getTime() - maxHours * 60 * 60 * 1000);
    const upperBound = new Date(now.getTime() - minHours * 60 * 60 * 1000);
    return this.prisma.problemReport.findMany({
      where: {
        status: ProblemReportStatus.DEFERRED,
        deferredAt: { gte: lowerBound, lt: upperBound },
      },
      select: { id: true, referenceNumber: true, deferredAt: true },
    });
  }
}
