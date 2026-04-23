import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentEntityType, DocumentType } from '@gmao/db';
import { PartsController } from './parts.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { DocumentsService } from '../assets/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const PART_ID = 'part-1';
const DOC_ID = 'doc-1';
const ACTOR_ID = 'actor-1';

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    entityType: DocumentEntityType.PART,
    entityId: PART_ID,
    documentType: DocumentType.TECHNICAL_MANUAL,
    fileName: 'manual.pdf',
    filePath: `parts/${PART_ID}/manual.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    version: 1,
    isCurrentVersion: true,
    replacedById: null,
    uploadedById: ACTOR_ID,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PartsController — document endpoints', () => {
  let controller: PartsController;
  let documentsService: jest.Mocked<DocumentsService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartsController],
      providers: [
        InventoryService,
        InventoryRepository,
        {
          provide: PrismaService,
          useValue: { part: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() } },
        },
        { provide: NotificationsService, useValue: {} },
        {
          provide: DocumentsService,
          useValue: {
            findByPart: jest.fn(),
            uploadForPart: jest.fn(),
            getDownloadUrl: jest.fn(),
            getVersionHistory: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PartsController);
    documentsService = module.get(DocumentsService) as jest.Mocked<DocumentsService>;
  });

  // ── listDocuments ────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('delegates to documentsService.findByPart', async () => {
      const docs = [makeDoc()];
      documentsService.findByPart.mockResolvedValue(docs as never);

      const result = await controller.listDocuments(PART_ID);

      expect(documentsService.findByPart).toHaveBeenCalledWith(PART_ID);
      expect(result).toEqual(docs);
    });

    it('propagates NotFoundException from service', async () => {
      documentsService.findByPart.mockRejectedValue(new NotFoundException());
      await expect(controller.listDocuments(PART_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── uploadDocument ───────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    const file = { originalname: 'sheet.pdf', buffer: Buffer.from(''), size: 512, mimetype: 'application/pdf' } as Express.Multer.File;
    const req = { user: { sub: ACTOR_ID } };

    it('delegates to documentsService.uploadForPart with correct args', async () => {
      const doc = makeDoc();
      documentsService.uploadForPart.mockResolvedValue(doc as never);

      const result = await controller.uploadDocument(PART_ID, file, DocumentType.SAFETY_DATA_SHEET, req);

      expect(documentsService.uploadForPart).toHaveBeenCalledWith(PART_ID, file, DocumentType.SAFETY_DATA_SHEET, ACTOR_ID);
      expect(result).toEqual(doc);
    });

    it('propagates BadRequestException for invalid doc type', async () => {
      documentsService.uploadForPart.mockRejectedValue(new BadRequestException('Invalid document type'));
      await expect(
        controller.uploadDocument(PART_ID, file, DocumentType.PHOTO, req),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDocumentDownload ──────────────────────────────────────────────────

  describe('getDocumentDownload', () => {
    it('returns presigned URL', async () => {
      documentsService.getDownloadUrl.mockResolvedValue('https://storage/presigned');
      const result = await controller.getDocumentDownload(DOC_ID);
      expect(documentsService.getDownloadUrl).toHaveBeenCalledWith(DOC_ID);
      expect(result).toBe('https://storage/presigned');
    });

    it('throws NotFoundException for missing doc', async () => {
      documentsService.getDownloadUrl.mockRejectedValue(new NotFoundException());
      await expect(controller.getDocumentDownload(DOC_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getDocumentVersionHistory ────────────────────────────────────────────

  describe('getDocumentVersionHistory', () => {
    it('returns version list ordered by version desc', async () => {
      const versions = [makeDoc({ version: 2, isCurrentVersion: true }), makeDoc({ version: 1, isCurrentVersion: false })];
      documentsService.getVersionHistory.mockResolvedValue(versions as never);

      const result = await controller.getDocumentVersionHistory(DOC_ID);

      expect(documentsService.getVersionHistory).toHaveBeenCalledWith(DOC_ID);
      expect(result).toHaveLength(2);
      expect((result as typeof versions)[0].version).toBe(2);
    });
  });

  // ── deleteDocument ───────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('delegates to documentsService.delete', async () => {
      documentsService.delete.mockResolvedValue(undefined);
      await controller.deleteDocument(DOC_ID);
      expect(documentsService.delete).toHaveBeenCalledWith(DOC_ID);
    });

    it('propagates NotFoundException for unknown doc', async () => {
      documentsService.delete.mockRejectedValue(new NotFoundException());
      await expect(controller.deleteDocument(DOC_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
