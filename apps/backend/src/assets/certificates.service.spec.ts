import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesService } from './certificates.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CertificateStatus } from '@gmao/db';

const ACTOR_ID = 'actor-1';
const CERT_ID = 'cert-1';
const ASSET_ID = 'asset-1';

function makeCert(overrides: Record<string, unknown> = {}) {
  return {
    id: CERT_ID,
    assetId: ASSET_ID,
    certificateType: 'ELECTRICAL',
    otherType: null,
    issuingAuthority: 'Bureau Veritas',
    issueDate: new Date('2024-01-01'),
    expirationDate: new Date('2026-01-01'),
    status: CertificateStatus.VALID,
    isArchived: false,
    archivedAt: null,
    archivedById: null,
    documentId: null,
    document: null,
    createdById: ACTOR_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        {
          provide: PrismaService,
          useValue: {
            complianceCertificate: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            asset: { findUnique: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: { upload: jest.fn(), delete: jest.fn(), buildKey: jest.fn(), getPresignedUrl: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CertificatesService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ─── archive ───────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('soft-deletes an active certificate', async () => {
      const cert = makeCert();
      (prisma.complianceCertificate.findUnique as jest.Mock).mockResolvedValue(cert);
      (prisma.complianceCertificate.update as jest.Mock).mockResolvedValue({
        ...cert, isArchived: true, archivedAt: expect.any(Date), archivedById: ACTOR_ID,
      });

      await service.archive(CERT_ID, ACTOR_ID);

      expect(prisma.complianceCertificate.update).toHaveBeenCalledWith({
        where: { id: CERT_ID },
        data: {
          isArchived: true,
          archivedAt: expect.any(Date),
          archivedById: ACTOR_ID,
        },
      });
    });

    it('throws BadRequestException when certificate is already archived', async () => {
      (prisma.complianceCertificate.findUnique as jest.Mock).mockResolvedValue(
        makeCert({ isArchived: true, archivedAt: new Date() }),
      );

      await expect(service.archive(CERT_ID, ACTOR_ID)).rejects.toThrow(BadRequestException);
      expect(prisma.complianceCertificate.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when certificate does not exist', async () => {
      (prisma.complianceCertificate.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.archive(CERT_ID, ACTOR_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByAsset ───────────────────────────────────────────────────────────

  describe('findByAsset', () => {
    it('excludes archived certificates', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });
      (prisma.complianceCertificate.findMany as jest.Mock).mockResolvedValue([]);

      await service.findByAsset(ASSET_ID);

      expect(prisma.complianceCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
    });
  });

  // ─── findExpiringSoon ──────────────────────────────────────────────────────

  describe('findExpiringSoon', () => {
    it('excludes archived certificates', async () => {
      (prisma.complianceCertificate.findMany as jest.Mock).mockResolvedValue([]);

      await service.findExpiringSoon();

      expect(prisma.complianceCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
    });
  });

  // ─── refreshStatuses ──────────────────────────────────────────────────────

  describe('refreshStatuses', () => {
    it('excludes archived certificates from status refresh', async () => {
      (prisma.complianceCertificate.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$transaction as jest.Mock).mockResolvedValue([]);

      await service.refreshStatuses();

      expect(prisma.complianceCertificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
    });
  });

  // ─── End-to-end flow ──────────────────────────────────────────────────────

  /**
   * Flow: Create cert → list shows it → archive → list hides it → archiving again fails.
   *
   * Failure scenario: attempting to archive an already-archived cert throws 400
   * so supervisors get clear feedback instead of a silent no-op.
   *
   * Regression: findByAsset with isArchived:false preserves behaviour for all
   * other callers that expect only live certificates (expiry job, UI list).
   */
  describe('full archive lifecycle', () => {
    it('archived cert no longer appears in findByAsset', async () => {
      const liveCert = makeCert();
      const archivedCert = makeCert({ isArchived: true });

      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });

      // Before archive — returns the live cert
      (prisma.complianceCertificate.findMany as jest.Mock).mockResolvedValueOnce([liveCert]);
      const before = await service.findByAsset(ASSET_ID);
      expect(before).toHaveLength(1);

      // Soft-archive it
      (prisma.complianceCertificate.findUnique as jest.Mock).mockResolvedValue(liveCert);
      (prisma.complianceCertificate.update as jest.Mock).mockResolvedValue(archivedCert);
      await service.archive(CERT_ID, ACTOR_ID);

      // After archive — query excludes it (simulated by returning empty array)
      (prisma.complianceCertificate.findMany as jest.Mock).mockResolvedValueOnce([]);
      const after = await service.findByAsset(ASSET_ID);
      expect(after).toHaveLength(0);

      // Attempt to archive again — throws 400
      (prisma.complianceCertificate.findUnique as jest.Mock).mockResolvedValue(archivedCert);
      await expect(service.archive(CERT_ID, ACTOR_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
