import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentEntityType, DocumentType } from '@gmao/db';

const PART_ALLOWED_TYPES = new Set<DocumentType>([
  DocumentType.TECHNICAL_MANUAL,
  DocumentType.SAFETY_DATA_SHEET,
  DocumentType.SPECIFICATION_SHEET,
]);

const PLAN_ALLOWED_TYPES = new Set<DocumentType>([
  DocumentType.PROCEDURE_DOCUMENT,
  DocumentType.SAFETY_DATA_SHEET,
  DocumentType.SPECIFICATION_SHEET,
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── Asset documents ──────────────────────────────────────────────────────

  async findByAsset(assetId: string) {
    await this.assertAssetExists(assetId);
    return this.prisma.document.findMany({
      where: {
        entityType: DocumentEntityType.ASSET,
        entityId: assetId,
        isCurrentVersion: true,
        // Exclude documents that are attached to a compliance certificate.
        // Those are accessed via the certificate's own download endpoint and
        // must not appear in — or be deletable from — the general documents list.
        certificate: null,
      },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async upload(
    assetId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    actorId: string,
  ) {
    if (documentType === DocumentType.COMPLIANCE_CERTIFICATE) {
      throw new BadRequestException(
        'COMPLIANCE_CERTIFICATE is a reserved document type. Use the certificate management endpoints to attach files to compliance certificates.',
      );
    }
    await this.assertAssetExists(assetId);
    return this._doUpload(DocumentEntityType.ASSET, assetId, file, documentType, actorId, 'assets');
  }

  // ── Part documents ───────────────────────────────────────────────────────

  async findByPart(partId: string) {
    await this.assertPartExists(partId);
    return this.prisma.document.findMany({
      where: { entityType: DocumentEntityType.PART, entityId: partId, isCurrentVersion: true },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async uploadForPart(
    partId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    actorId: string,
  ) {
    if (!PART_ALLOWED_TYPES.has(documentType)) {
      throw new BadRequestException(
        `Invalid document type for parts. Allowed: ${[...PART_ALLOWED_TYPES].join(', ')}`,
      );
    }
    await this.assertPartExists(partId);
    return this._doUpload(DocumentEntityType.PART, partId, file, documentType, actorId, 'parts');
  }

  // ── Preventive plan documents ────────────────────────────────────────────

  async findByPlan(planId: string) {
    await this.assertPlanExists(planId);
    return this.prisma.document.findMany({
      where: {
        entityType: DocumentEntityType.PREVENTIVE_PLAN,
        entityId: planId,
        isCurrentVersion: true,
      },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async uploadForPlan(
    planId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    actorId: string,
  ) {
    if (!PLAN_ALLOWED_TYPES.has(documentType)) {
      throw new BadRequestException(
        `Invalid document type for preventive plans. Allowed: ${[...PLAN_ALLOWED_TYPES].join(', ')}`,
      );
    }
    await this.assertPlanExists(planId);
    return this._doUpload(
      DocumentEntityType.PREVENTIVE_PLAN,
      planId,
      file,
      documentType,
      actorId,
      'plans',
    );
  }

  // ── Shared ───────────────────────────────────────────────────────────────

  async getDownloadUrl(documentId: string): Promise<string> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return this.storage.getPresignedUrl('documents', doc.filePath);
  }

  async getVersionHistory(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return this.prisma.document.findMany({
      where: {
        entityType: doc.entityType,
        entityId: doc.entityId,
        documentType: doc.documentType,
      },
      orderBy: { version: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async delete(documentId: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { certificate: { select: { id: true } } },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.certificate) {
      throw new ForbiddenException(
        'This document is attached to a compliance certificate and cannot be deleted directly. Delete the certificate instead.',
      );
    }
    await this.storage.delete('documents', doc.filePath);
    await this.prisma.document.delete({ where: { id: documentId } });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Generic upload with versioning: if a document of the same type already
   * exists for this entity, it is archived (isCurrentVersion = false) and
   * linked to the new document via the DocumentVersionChain relation.
   */
  private async _doUpload(
    entityType: DocumentEntityType,
    entityId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    actorId: string,
    storagePrefix: string,
  ) {
    const key = this.storage.buildKey(storagePrefix, entityId, file.originalname);
    await this.storage.upload('documents', key, file.buffer, file.mimetype);

    const existing = await this.prisma.document.findFirst({
      where: { entityType, entityId, documentType, isCurrentVersion: true },
    });

    const newVersion = existing ? existing.version + 1 : 1;

    return this.prisma.$transaction(async (tx) => {
      const newDoc = await tx.document.create({
        data: {
          entityType,
          entityId,
          documentType,
          fileName: file.originalname,
          filePath: key,
          fileSize: file.size,
          mimeType: file.mimetype,
          version: newVersion,
          isCurrentVersion: true,
          uploadedById: actorId,
        },
      });

      if (existing) {
        await tx.document.update({
          where: { id: existing.id },
          data: { isCurrentVersion: false, replacedById: newDoc.id },
        });
      }

      return newDoc;
    });
  }

  private async assertAssetExists(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
  }

  private async assertPartExists(partId: string): Promise<void> {
    const part = await this.prisma.part.findUnique({ where: { id: partId } });
    if (!part) throw new NotFoundException(`Part ${partId} not found`);
  }

  private async assertPlanExists(planId: string): Promise<void> {
    const plan = await this.prisma.preventivePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Preventive plan ${planId} not found`);
  }
}
