import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentEntityType, DocumentType } from '@gmao/db';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findByAsset(assetId: string) {
    await this.assertAssetExists(assetId);
    return this.prisma.document.findMany({
      where: { entityType: DocumentEntityType.ASSET, entityId: assetId, isCurrentVersion: true },
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
    await this.assertAssetExists(assetId);

    const key = this.storage.buildKey('assets', assetId, file.originalname);
    await this.storage.upload('documents', key, file.buffer, file.mimetype);

    return this.prisma.document.create({
      data: {
        entityType: DocumentEntityType.ASSET,
        entityId: assetId,
        documentType,
        fileName: file.originalname,
        filePath: key,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: actorId,
      },
    });
  }

  async getDownloadUrl(documentId: string): Promise<string> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return this.storage.getPresignedUrl('documents', doc.filePath);
  }

  async delete(documentId: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    await this.storage.delete('documents', doc.filePath);
    await this.prisma.document.delete({ where: { id: documentId } });
  }

  private async assertAssetExists(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
  }
}
