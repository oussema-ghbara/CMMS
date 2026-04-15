import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { CertificateStatus, CertificateType, DocumentEntityType, DocumentType } from '@gmao/db';

function deriveCertificateStatus(expirationDate: Date): CertificateStatus {
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntilExpiry < 0) return CertificateStatus.EXPIRED;
  if (daysUntilExpiry <= 60) return CertificateStatus.EXPIRING_SOON;
  return CertificateStatus.VALID;
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findByAsset(assetId: string) {
    await this.assertAssetExists(assetId);
    return this.prisma.complianceCertificate.findMany({
      where: { assetId },
      orderBy: { expirationDate: 'asc' },
      include: { document: true },
    });
  }

  async findById(id: string) {
    const cert = await this.prisma.complianceCertificate.findUnique({
      where: { id },
      include: { document: true },
    });
    if (!cert) throw new NotFoundException(`Certificate ${id} not found`);
    return cert;
  }

  async create(
    assetId: string,
    dto: CreateCertificateDto,
    actorId: string,
    file?: Express.Multer.File,
  ) {
    await this.assertAssetExists(assetId);

    if (dto.certificateType === CertificateType.OTHER && !dto.otherType) {
      throw new BadRequestException('otherType is required when certificateType is OTHER');
    }

    const expiration = new Date(dto.expirationDate);
    const status = deriveCertificateStatus(expiration);

    return this.prisma.$transaction(async (tx) => {
      let documentId: string | undefined;

      if (file) {
        const key = this.storage.buildKey('certificates', assetId, file.originalname);
        await this.storage.upload('documents', key, file.buffer, file.mimetype);

        const doc = await tx.document.create({
          data: {
            entityType: DocumentEntityType.ASSET,
            entityId: assetId,
            documentType: DocumentType.COMPLIANCE_CERTIFICATE,
            fileName: file.originalname,
            filePath: key,
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadedById: actorId,
          },
        });
        documentId = doc.id;
      }

      return tx.complianceCertificate.create({
        data: {
          assetId,
          certificateType: dto.certificateType,
          otherType: dto.otherType,
          issuingAuthority: dto.issuingAuthority,
          issueDate: new Date(dto.issueDate),
          expirationDate: expiration,
          status,
          documentId,
          createdById: actorId,
        },
        include: { document: true },
      });
    });
  }

  async update(
    id: string,
    dto: UpdateCertificateDto,
    actorId: string,
    file?: Express.Multer.File,
  ) {
    const cert = await this.findById(id);

    const expiration = dto.expirationDate ? new Date(dto.expirationDate) : cert.expirationDate;
    const status = deriveCertificateStatus(expiration);

    return this.prisma.$transaction(async (tx) => {
      let documentId = cert.documentId;

      if (file) {
        if (cert.documentId && cert.document) {
          await this.storage.delete('documents', cert.document.filePath);
          await tx.document.delete({ where: { id: cert.documentId } });
        }
        const key = this.storage.buildKey('certificates', cert.assetId, file.originalname);
        await this.storage.upload('documents', key, file.buffer, file.mimetype);
        const doc = await tx.document.create({
          data: {
            entityType: DocumentEntityType.ASSET,
            entityId: cert.assetId,
            documentType: DocumentType.COMPLIANCE_CERTIFICATE,
            fileName: file.originalname,
            filePath: key,
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadedById: actorId,
          },
        });
        documentId = doc.id;
      }

      return tx.complianceCertificate.update({
        where: { id },
        data: {
          certificateType: dto.certificateType,
          otherType: dto.otherType,
          issuingAuthority: dto.issuingAuthority,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          expirationDate: expiration,
          status,
          documentId,
        },
        include: { document: true },
      });
    });
  }

  async delete(id: string) {
    const cert = await this.findById(id);
    if (cert.documentId && cert.document) {
      await this.storage.delete('documents', cert.document.filePath);
      await this.prisma.document.delete({ where: { id: cert.documentId } });
    }
    await this.prisma.complianceCertificate.delete({ where: { id } });
  }

  async getDocumentUrl(id: string): Promise<string> {
    const cert = await this.findById(id);
    if (!cert.documentId || !cert.document) {
      throw new NotFoundException('No document attached to this certificate');
    }
    return this.storage.getPresignedUrl('documents', cert.document.filePath);
  }

  // Called by the expiry job
  async findExpiringSoon(): Promise<Array<{ id: string; assetId: string; expirationDate: Date; asset: { name: string } }>> {
    const in60Days = new Date();
    in60Days.setDate(in60Days.getDate() + 60);

    return this.prisma.complianceCertificate.findMany({
      where: {
        expirationDate: { lte: in60Days },
        status: { not: CertificateStatus.EXPIRED },
      },
      select: { id: true, assetId: true, expirationDate: true, asset: { select: { name: true } } },
    });
  }

  async refreshStatuses(): Promise<void> {
    const certs = await this.prisma.complianceCertificate.findMany({
      where: { status: { not: CertificateStatus.EXPIRED } },
      select: { id: true, expirationDate: true, status: true },
    });

    const updates = certs
      .map((c) => ({ id: c.id, newStatus: deriveCertificateStatus(c.expirationDate) }))
      .filter((c) => c.newStatus !== certs.find((x) => x.id === c.id)?.status);

    await this.prisma.$transaction(
      updates.map(({ id, newStatus }) =>
        this.prisma.complianceCertificate.update({ where: { id }, data: { status: newStatus } }),
      ),
    );
  }

  private async assertAssetExists(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
  }
}
