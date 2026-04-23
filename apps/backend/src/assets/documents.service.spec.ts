import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentEntityType, DocumentType } from '@gmao/db';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const ACTOR_ID = 'user-1';
const ASSET_ID = 'asset-1';
const PART_ID = 'part-1';
const PLAN_ID = 'plan-1';
const DOC_ID = 'doc-1';

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    entityType: DocumentEntityType.ASSET,
    entityId: ASSET_ID,
    documentType: DocumentType.TECHNICAL_MANUAL,
    fileName: 'manual.pdf',
    filePath: 'assets/asset-1/manual.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    version: 1,
    isCurrentVersion: true,
    replacedById: null,
    uploadedById: ACTOR_ID,
    createdAt: new Date(),
    certificate: null,
    ...overrides,
  };
}

function makeFile(name = 'file.pdf'): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.from('data'),
    size: 1024,
    mimetype: 'application/pdf',
  } as Express.Multer.File;
}

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: jest.Mocked<PrismaService>;
  let storage: jest.Mocked<StorageService>;

  const txMock = {
    document: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: {
            document: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            asset: { findUnique: jest.fn() },
            part: { findUnique: jest.fn() },
            preventivePlan: { findUnique: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            buildKey: jest.fn().mockImplementation((prefix, id, name) => `${prefix}/${id}/${name}`),
            upload: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            getPresignedUrl: jest.fn().mockResolvedValue('https://storage/presigned'),
          },
        },
      ],
    }).compile();

    service = module.get(DocumentsService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    storage = module.get(StorageService) as jest.Mocked<StorageService>;

    // Default $transaction: execute callback immediately
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
  });

  // ── findByAsset ──────────────────────────────────────────────────────────

  describe('findByAsset', () => {
    it('returns current-version docs for an existing asset', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([makeDoc()]);

      const result = await service.findByAsset(ASSET_ID);

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: DocumentEntityType.ASSET,
            entityId: ASSET_ID,
            isCurrentVersion: true,
            certificate: null,
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException if asset does not exist', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findByAsset(ASSET_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── upload (asset) with versioning ──────────────────────────────────────

  describe('upload — asset with versioning', () => {
    it('rejects COMPLIANCE_CERTIFICATE document type', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });
      await expect(
        service.upload(ASSET_ID, makeFile(), DocumentType.COMPLIANCE_CERTIFICATE, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates version 1 when no existing document', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const newDoc = makeDoc({ version: 1 });
      txMock.document.create.mockResolvedValue(newDoc);

      const result = await service.upload(ASSET_ID, makeFile(), DocumentType.TECHNICAL_MANUAL, ACTOR_ID);

      expect(txMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 1, isCurrentVersion: true }),
        }),
      );
      expect(txMock.document.update).not.toHaveBeenCalled();
      expect(result).toEqual(newDoc);
    });

    it('archives old version and creates version 2 when previous exists', async () => {
      (prisma.asset.findUnique as jest.Mock).mockResolvedValue({ id: ASSET_ID });
      const oldDoc = makeDoc({ id: 'old-doc', version: 1, isCurrentVersion: true });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(oldDoc);
      const newDoc = makeDoc({ id: 'new-doc', version: 2 });
      txMock.document.create.mockResolvedValue(newDoc);
      txMock.document.update.mockResolvedValue({ ...oldDoc, isCurrentVersion: false });

      const result = await service.upload(ASSET_ID, makeFile(), DocumentType.TECHNICAL_MANUAL, ACTOR_ID);

      expect(txMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2, isCurrentVersion: true }),
        }),
      );
      expect(txMock.document.update).toHaveBeenCalledWith({
        where: { id: 'old-doc' },
        data: { isCurrentVersion: false, replacedById: 'new-doc' },
      });
      expect(result).toEqual(newDoc);
    });
  });

  // ── uploadForPart ────────────────────────────────────────────────────────

  describe('uploadForPart', () => {
    it('rejects a disallowed document type', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue({ id: PART_ID });
      await expect(
        service.uploadForPart(PART_ID, makeFile(), DocumentType.PHOTO, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if part does not exist', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.uploadForPart(PART_ID, makeFile(), DocumentType.TECHNICAL_MANUAL, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates first-version part document', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue({ id: PART_ID });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const newDoc = makeDoc({ entityType: DocumentEntityType.PART, entityId: PART_ID, version: 1 });
      txMock.document.create.mockResolvedValue(newDoc);

      const result = await service.uploadForPart(PART_ID, makeFile(), DocumentType.TECHNICAL_MANUAL, ACTOR_ID);

      expect(txMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: DocumentEntityType.PART,
            entityId: PART_ID,
            version: 1,
            isCurrentVersion: true,
          }),
        }),
      );
      expect(result).toEqual(newDoc);
    });

    it('archives previous version when re-uploading same type', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue({ id: PART_ID });
      const oldDoc = makeDoc({ id: 'old', entityType: DocumentEntityType.PART, entityId: PART_ID, version: 1 });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(oldDoc);
      const newDoc = makeDoc({ id: 'new', entityType: DocumentEntityType.PART, entityId: PART_ID, version: 2 });
      txMock.document.create.mockResolvedValue(newDoc);

      await service.uploadForPart(PART_ID, makeFile(), DocumentType.TECHNICAL_MANUAL, ACTOR_ID);

      expect(txMock.document.update).toHaveBeenCalledWith({
        where: { id: 'old' },
        data: { isCurrentVersion: false, replacedById: 'new' },
      });
    });

    it('accepts all allowed part doc types', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue({ id: PART_ID });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      txMock.document.create.mockResolvedValue(makeDoc());

      for (const type of [DocumentType.TECHNICAL_MANUAL, DocumentType.SAFETY_DATA_SHEET, DocumentType.SPECIFICATION_SHEET]) {
        await expect(service.uploadForPart(PART_ID, makeFile(), type, ACTOR_ID)).resolves.toBeDefined();
      }
    });
  });

  // ── findByPart ───────────────────────────────────────────────────────────

  describe('findByPart', () => {
    it('returns current-version docs for a part', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue({ id: PART_ID });
      const docs = [makeDoc({ entityType: DocumentEntityType.PART, entityId: PART_ID })];
      (prisma.document.findMany as jest.Mock).mockResolvedValue(docs);

      const result = await service.findByPart(PART_ID);

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: DocumentEntityType.PART, entityId: PART_ID, isCurrentVersion: true },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException if part not found', async () => {
      (prisma.part.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findByPart(PART_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── uploadForPlan ────────────────────────────────────────────────────────

  describe('uploadForPlan', () => {
    it('rejects a disallowed document type', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue({ id: PLAN_ID });
      await expect(
        service.uploadForPlan(PLAN_ID, makeFile(), DocumentType.PHOTO, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if plan does not exist', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.uploadForPlan(PLAN_ID, makeFile(), DocumentType.PROCEDURE_DOCUMENT, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a plan document with correct entityType', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue({ id: PLAN_ID });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const newDoc = makeDoc({ entityType: DocumentEntityType.PREVENTIVE_PLAN, entityId: PLAN_ID });
      txMock.document.create.mockResolvedValue(newDoc);

      const result = await service.uploadForPlan(PLAN_ID, makeFile(), DocumentType.PROCEDURE_DOCUMENT, ACTOR_ID);

      expect(txMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: DocumentEntityType.PREVENTIVE_PLAN,
            entityId: PLAN_ID,
          }),
        }),
      );
      expect(result).toEqual(newDoc);
    });

    it('accepts all allowed plan doc types', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue({ id: PLAN_ID });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      txMock.document.create.mockResolvedValue(makeDoc());

      for (const type of [DocumentType.PROCEDURE_DOCUMENT, DocumentType.SAFETY_DATA_SHEET, DocumentType.SPECIFICATION_SHEET]) {
        await expect(service.uploadForPlan(PLAN_ID, makeFile(), type, ACTOR_ID)).resolves.toBeDefined();
      }
    });
  });

  // ── findByPlan ───────────────────────────────────────────────────────────

  describe('findByPlan', () => {
    it('returns current-version docs for a plan', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue({ id: PLAN_ID });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([]);

      await service.findByPlan(PLAN_ID);

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: DocumentEntityType.PREVENTIVE_PLAN,
            entityId: PLAN_ID,
            isCurrentVersion: true,
          },
        }),
      );
    });

    it('throws NotFoundException if plan not found', async () => {
      (prisma.preventivePlan.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findByPlan(PLAN_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getVersionHistory ────────────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('returns all versions for the same entity+type chain', async () => {
      const doc = makeDoc();
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(doc);
      const versions = [makeDoc({ version: 2, isCurrentVersion: true }), makeDoc({ version: 1, isCurrentVersion: false })];
      (prisma.document.findMany as jest.Mock).mockResolvedValue(versions);

      const result = await service.getVersionHistory(DOC_ID);

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: doc.entityType,
            entityId: doc.entityId,
            documentType: doc.documentType,
          },
          orderBy: { version: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException if document not found', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getVersionHistory(DOC_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws NotFoundException if doc not found', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.delete(DOC_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if doc is a certificate document', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(
        makeDoc({ certificate: { id: 'cert-1' } }),
      );
      await expect(service.delete(DOC_ID)).rejects.toThrow(ForbiddenException);
    });

    it('deletes storage file and DB record', async () => {
      const doc = makeDoc();
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(doc);
      (prisma.document.delete as jest.Mock).mockResolvedValue(doc);

      await service.delete(DOC_ID);

      expect(storage.delete).toHaveBeenCalledWith('documents', doc.filePath);
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: DOC_ID } });
    });
  });

  // ── getDownloadUrl ───────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('returns presigned URL for existing doc', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(makeDoc());
      const url = await service.getDownloadUrl(DOC_ID);
      expect(url).toBe('https://storage/presigned');
    });

    it('throws NotFoundException if doc not found', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getDownloadUrl(DOC_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
