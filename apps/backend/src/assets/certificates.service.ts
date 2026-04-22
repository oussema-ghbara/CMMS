import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { CertificateStatus, CertificateType, DocumentEntityType, DocumentType, Prisma } from '@gmao/db';

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
    const where = { assetId, isArchived: false } as Prisma.ComplianceCertificateWhereInput;
    return this.prisma.complianceCertificate.findMany({
      where,
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

  async archive(id: string, actorId: string): Promise<void> {
    const cert = await this.findById(id);
    // isArchived may not exist in the current Prisma client until `prisma generate` is run
    if ((cert as any).isArchived) {
      throw new BadRequestException(`Certificate ${id} is already archived`);
    }
    await this.prisma.complianceCertificate.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date(), archivedById: actorId } as Prisma.ComplianceCertificateUpdateInput,
    });
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

    const where = {
      expirationDate: { lte: in60Days },
      status: { not: CertificateStatus.EXPIRED },
      isArchived: false,
    } as Prisma.ComplianceCertificateWhereInput;
    return this.prisma.complianceCertificate.findMany({
      where,
      select: { id: true, assetId: true, expirationDate: true, asset: { select: { name: true } } },
    }) as Promise<Array<{ id: string; assetId: string; expirationDate: Date; asset: { name: string } }>>;
  }

  async refreshStatuses(): Promise<void> {
    const refreshWhere = { status: { not: CertificateStatus.EXPIRED }, isArchived: false } as Prisma.ComplianceCertificateWhereInput;
    const certs = await this.prisma.complianceCertificate.findMany({
      where: refreshWhere,
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

  /**
   * Returns all non-archived certificates in EXPIRING_SOON or EXPIRED state,
   * ordered by expiration date ascending, with their parent asset name/id.
   * Used by the supervisor dashboard certificate-alerts panel.
   */
  async findAlerts(): Promise<CertificateAlertItem[]> {
    const where = {
      isArchived: false,
      status: { in: [CertificateStatus.EXPIRING_SOON, CertificateStatus.EXPIRED] },
    } as Prisma.ComplianceCertificateWhereInput;

    const certs = await this.prisma.complianceCertificate.findMany({
      where,
      orderBy: { expirationDate: 'asc' },
      select: {
        assetId: true,
        certificateType: true,
        otherType: true,
        expirationDate: true,
        status: true,
        asset: { select: { id: true, name: true } },
      },
    });

    return certs.map((c) => ({
      assetId: c.asset.id,
      assetName: c.asset.name,
      certificateType: c.certificateType as string,
      otherType: c.otherType,
      expirationDate: c.expirationDate,
      status: c.status as 'EXPIRING_SOON' | 'EXPIRED',
    }));
  }

  private async assertAssetExists(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
  }
}

export interface CertificateAlertItem {
  assetId: string;
  assetName: string;
  certificateType: string;
  otherType: string | null;
  expirationDate: Date;
  status: 'EXPIRING_SOON' | 'EXPIRED';
}

