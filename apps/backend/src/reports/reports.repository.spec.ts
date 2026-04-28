/**
 * §9.1 — ReportsRepository.findById enrichment.
 *
 * Verifies that findById returns:
 *  - asset.workOrders (non-terminal, for duplicate detection)
 *  - asset.certificates (EXPIRING_SOON or EXPIRED, non-archived)
 *  - assetInterventionHistory (last 5 closed WOs, newest first)
 */
import { NotFoundException } from '@nestjs/common';
import { ReportsRepository } from './reports.repository';
import { WorkOrderStatus, CertificateStatus } from '@gmao/db';

function buildPrisma(reportOverride: Record<string, unknown> = {}) {
  const baseReport = {
    id: 'report-1',
    assetId: 'asset-1',
    referenceNumber: 'REP-001',
    description: 'Machine stopped',
    reporter: { id: 'user-1', name: 'Alice' },
    processedBy: null,
    asset: {
      id: 'asset-1',
      name: 'Press 01',
      status: 'OPERATIONAL',
      location: { id: 'loc-1', fullPath: 'Hall A / Press 01' },
      workOrders: [
        {
          id: 'wo-active-1',
          referenceNumber: 'WO-001',
          status: WorkOrderStatus.IN_PROGRESS,
          type: 'CORRECTIVE',
          description: 'Leak repair',
          createdAt: new Date('2026-04-20'),
        },
      ],
      certificates: [
        {
          id: 'cert-1',
          certificateType: 'ELECTRICAL',
          otherType: null,
          status: CertificateStatus.EXPIRING_SOON,
          expirationDate: new Date('2026-05-01'),
          issuingAuthority: 'Bureau Veritas',
        },
      ],
    },
    comments: [],
    derivedWorkOrders: [],
    ...reportOverride,
  };

  const assetHistory = [
    {
      id: 'wo-closed-1',
      referenceNumber: 'WO-000',
      type: 'CORRECTIVE',
      closedAt: new Date('2026-04-15'),
      description: 'Previous repair',
      principalTechnician: { id: 'tech-1', name: 'Bob' },
    },
  ];

  const problemReport = {
    findUnique: jest.fn().mockResolvedValue(baseReport),
  };

  const workOrder = {
    findMany: jest.fn().mockResolvedValue(assetHistory),
  };

  const prisma = {
    problemReport,
    workOrder,
  };

  const repo = new ReportsRepository(prisma as never);

  return { repo, prisma, baseReport, assetHistory };
}

describe('ReportsRepository.findById — §9.1 enrichment', () => {
  it('returns asset.workOrders (active WOs for duplicate detection)', async () => {
    const { repo, baseReport } = buildPrisma();

    const result = await repo.findById('report-1');

    expect(result.asset.workOrders).toEqual(baseReport.asset.workOrders);
    expect(result.asset.workOrders[0].status).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it('returns asset.certificates (alert-level certs only)', async () => {
    const { repo, baseReport } = buildPrisma();

    const result = await repo.findById('report-1');

    expect(result.asset.certificates).toHaveLength(1);
    expect(result.asset.certificates[0].status).toBe(CertificateStatus.EXPIRING_SOON);
  });

  it('returns assetInterventionHistory from the second query', async () => {
    const { repo, assetHistory } = buildPrisma();

    const result = await repo.findById('report-1');

    expect(result.assetInterventionHistory).toEqual(assetHistory);
    expect(result.assetInterventionHistory[0].principalTechnician?.name).toBe('Bob');
  });

  it('queries intervention history by assetId, CLOSED status, closedAt not null, newest first, take 5', async () => {
    const { repo, prisma } = buildPrisma();

    await repo.findById('report-1');

    expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
      where: {
        assetId: 'asset-1',
        status: WorkOrderStatus.CLOSED,
        closedAt: { not: null },
      },
      orderBy: { closedAt: 'desc' },
      take: 5,
      select: expect.objectContaining({
        id: true,
        referenceNumber: true,
        type: true,
        closedAt: true,
        description: true,
        principalTechnician: expect.any(Object),
      }),
    });
  });

  it('throws NotFoundException when the report does not exist', async () => {
    const { repo, prisma } = buildPrisma();
    (prisma.problemReport.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(repo.findById('non-existent')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries asset.workOrders with notIn terminal statuses', async () => {
    const { repo, prisma } = buildPrisma();

    await repo.findById('report-1');

    const call = (prisma.problemReport.findUnique as jest.Mock).mock.calls[0][0];
    const assetInclude = call.include.asset.include;

    expect(assetInclude.workOrders.where.status.notIn).toContain(WorkOrderStatus.CLOSED);
    expect(assetInclude.workOrders.where.status.notIn).toContain(WorkOrderStatus.CANCELLED);
  });

  it('queries certificates with isArchived:false and alert statuses', async () => {
    const { repo, prisma } = buildPrisma();

    await repo.findById('report-1');

    const call = (prisma.problemReport.findUnique as jest.Mock).mock.calls[0][0];
    const certsWhere = call.include.asset.include.certificates.where;

    expect(certsWhere.isArchived).toBe(false);
    expect(certsWhere.status.in).toContain(CertificateStatus.EXPIRING_SOON);
    expect(certsWhere.status.in).toContain(CertificateStatus.EXPIRED);
  });
});

// ── §9.1 — findAll sort order ─────────────────────────────────────────────────

function buildFindAllPrisma() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    problemReport: { findMany, count },
    $transaction: jest.fn().mockImplementation((calls: Promise<unknown>[]) => Promise.all(calls)),
  };
  const repo = new ReportsRepository(prisma as never);
  return { repo, prisma, findMany };
}

describe('ReportsRepository.findAll — §9.1 sort order', () => {
  it('orders by urgencyPerception ASC then createdAt ASC', async () => {
    const { repo, findMany } = buildFindAllPrisma();

    await repo.findAll({ page: 1, limit: 20 } as never);

    const call = findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(call.orderBy).toEqual([{ urgencyPerception: 'asc' }, { createdAt: 'asc' }]);
  });

  it('does NOT order by createdAt DESC alone', async () => {
    const { repo, findMany } = buildFindAllPrisma();

    await repo.findAll({ page: 1, limit: 20 } as never);

    const call = findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(call.orderBy).not.toEqual({ createdAt: 'desc' });
  });

  it('passes through filter parameters to where clause', async () => {
    const { repo, findMany } = buildFindAllPrisma();

    await repo.findAll({ status: 'PENDING' as never, page: 1, limit: 10 } as never);

    const call = findMany.mock.calls[0][0] as { where: { status?: string } };
    expect(call.where.status).toBe('PENDING');
  });

  it('applies pagination correctly', async () => {
    const { repo, findMany } = buildFindAllPrisma();

    await repo.findAll({ page: 3, limit: 10 } as never);

    const call = findMany.mock.calls[0][0] as { skip: number; take: number };
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });
});
