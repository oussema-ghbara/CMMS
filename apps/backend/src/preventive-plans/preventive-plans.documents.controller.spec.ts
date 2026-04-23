import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DocumentEntityType, DocumentType } from '@gmao/db';
import { PreventivePlansController } from './preventive-plans.controller';
import { PreventivePlansService } from './preventive-plans.service';
import { PreventivePlansRepository } from './preventive-plans.repository';
import { DocumentsService } from '../assets/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PREVENTIVE_PLAN_QUEUE } from './preventive-plans.constants';

const PLAN_ID = 'plan-1';
const DOC_ID = 'doc-1';
const ACTOR_ID = 'actor-1';

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    entityType: DocumentEntityType.PREVENTIVE_PLAN,
    entityId: PLAN_ID,
    documentType: DocumentType.PROCEDURE_DOCUMENT,
    fileName: 'procedure.pdf',
    filePath: `plans/${PLAN_ID}/procedure.pdf`,
    fileSize: 2048,
    mimeType: 'application/pdf',
    version: 1,
    isCurrentVersion: true,
    replacedById: null,
    uploadedById: ACTOR_ID,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PreventivePlansController — document endpoints', () => {
  let controller: PreventivePlansController;
  let documentsService: jest.Mocked<DocumentsService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreventivePlansController],
      providers: [
        PreventivePlansService,
        PreventivePlansRepository,
        {
          provide: PrismaService,
          useValue: {
            preventivePlan: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
            preventivePlanChecklistItem: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
          },
        },
        { provide: NotificationsService, useValue: {} },
        { provide: getQueueToken(PREVENTIVE_PLAN_QUEUE), useValue: { add: jest.fn() } },
        {
          provide: DocumentsService,
          useValue: {
            findByPlan: jest.fn(),
            uploadForPlan: jest.fn(),
            getDownloadUrl: jest.fn(),
            getVersionHistory: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PreventivePlansController);
    documentsService = module.get(DocumentsService) as jest.Mocked<DocumentsService>;
  });

  // ── listDocuments ────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('delegates to documentsService.findByPlan', async () => {
      const docs = [makeDoc()];
      documentsService.findByPlan.mockResolvedValue(docs as never);

      const result = await controller.listDocuments(PLAN_ID);

      expect(documentsService.findByPlan).toHaveBeenCalledWith(PLAN_ID);
      expect(result).toEqual(docs);
    });

    it('propagates NotFoundException if plan not found', async () => {
      documentsService.findByPlan.mockRejectedValue(new NotFoundException());
      await expect(controller.listDocuments(PLAN_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── uploadDocument ───────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    const file = { originalname: 'proc.pdf', buffer: Buffer.from(''), size: 512, mimetype: 'application/pdf' } as Express.Multer.File;
    const req = { user: { sub: ACTOR_ID } };

    it('delegates to documentsService.uploadForPlan', async () => {
      const doc = makeDoc();
      documentsService.uploadForPlan.mockResolvedValue(doc as never);

      const result = await controller.uploadDocument(PLAN_ID, file, DocumentType.PROCEDURE_DOCUMENT, req);

      expect(documentsService.uploadForPlan).toHaveBeenCalledWith(PLAN_ID, file, DocumentType.PROCEDURE_DOCUMENT, ACTOR_ID);
      expect(result).toEqual(doc);
    });

    it('propagates BadRequestException for disallowed type', async () => {
      documentsService.uploadForPlan.mockRejectedValue(new BadRequestException('Invalid document type'));
      await expect(
        controller.uploadDocument(PLAN_ID, file, DocumentType.SCHEMATIC, req),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDocumentDownload ──────────────────────────────────────────────────

  describe('getDocumentDownload', () => {
    it('returns presigned URL', async () => {
      documentsService.getDownloadUrl.mockResolvedValue('https://s3/signed-url');
      const url = await controller.getDocumentDownload(DOC_ID);
      expect(url).toBe('https://s3/signed-url');
    });
  });

  // ── getDocumentVersionHistory ────────────────────────────────────────────

  describe('getDocumentVersionHistory', () => {
    it('returns all versions for a document chain', async () => {
      const versions = [
        makeDoc({ version: 2, isCurrentVersion: true }),
        makeDoc({ id: 'old-doc', version: 1, isCurrentVersion: false }),
      ];
      documentsService.getVersionHistory.mockResolvedValue(versions as never);

      const result = await controller.getDocumentVersionHistory(DOC_ID);

      expect(documentsService.getVersionHistory).toHaveBeenCalledWith(DOC_ID);
      expect(result).toHaveLength(2);
    });
  });

  // ── deleteDocument ───────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('delegates to documentsService.delete', async () => {
      documentsService.delete.mockResolvedValue(undefined);
      await controller.deleteDocument(DOC_ID);
      expect(documentsService.delete).toHaveBeenCalledWith(DOC_ID);
    });
  });
});
