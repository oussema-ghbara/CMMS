import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, Request,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { AssetsService } from './assets.service';
import { CertificatesService } from './certificates.service';
import { DocumentsService } from './documents.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetStatusTransitionDto } from './dto/asset-status-transition.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { DocumentType } from '@gmao/db';

@ApiTags('Assets')
@ApiBearerAuth()
@OperationalRoles()
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly certificates: CertificatesService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List assets with filters and pagination (all roles)' })
  findAll(@Query() query: AssetQueryDto) {
    return this.assets.findAll(query);
  }

  @Get('qr/:qrCode')
  @ApiOperation({ summary: 'Resolve asset by QR code identifier (all roles)' })
  findByQrCode(@Param('qrCode') qrCode: string) {
    return this.assets.findByQrCode(qrCode);
  }

  @Get('certificates/alerts')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'List certificate alerts (EXPIRING_SOON/EXPIRED) for supervisor dashboard (Supervisor)' })
  getCertificateAlerts() {
    return this.certificates.findAlerts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full asset detail (all roles)' })
  findById(@Param('id') id: string) {
    return this.assets.findById(id);
  }

  @Post()
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Create asset (Supervisor)' })
  create(@Body() dto: CreateAssetDto, @Request() req: { user: { sub: string } }) {
    return this.assets.create(dto, req.user.sub);
  }

  @Patch(':id')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Update asset (Supervisor)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assets.update(id, dto, req.user.sub);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Manual status transition: OPERATIONAL / OUT_OF_SERVICE / DECOMMISSIONED (Supervisor)' })
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: AssetStatusTransitionDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assets.transitionStatus(id, dto, req.user.sub);
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Asset status history (all roles)' })
  getStatusHistory(@Param('id') id: string) {
    return this.assets.getStatusHistory(id);
  }

  @Get(':id/certificates')
  @ApiOperation({ summary: 'List certificates for asset (all roles)' })
  listCertificates(@Param('id') id: string) {
    return this.certificates.findByAsset(id);
  }

  @Post(':id/certificates')
  @Roles(Role.SUPERVISOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Create certificate with optional document upload (Supervisor)' })
  createCertificate(
    @Param('id') id: string,
    @Body() dto: CreateCertificateDto,
    @Request() req: { user: { sub: string } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.certificates.create(id, dto, req.user.sub, file);
  }

  @Patch(':id/certificates/:certId')
  @Roles(Role.SUPERVISOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Update certificate (Supervisor)' })
  updateCertificate(
    @Param('certId') certId: string,
    @Body() dto: UpdateCertificateDto,
    @Request() req: { user: { sub: string } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.certificates.update(certId, dto, req.user.sub, file);
  }

  @Delete(':id/certificates/:certId')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive certificate — soft delete preserving audit trail (Supervisor)' })
  archiveCertificate(
    @Param('certId') certId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.certificates.archive(certId, req.user.sub);
  }

  @Get(':id/certificates/:certId/download')
  @ApiOperation({ summary: 'Get presigned download URL for certificate document (all roles)' })
  getCertificateDownload(@Param('certId') certId: string) {
    return this.certificates.getDocumentUrl(certId);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List documents for asset (all roles)' })
  listDocuments(@Param('id') id: string) {
    return this.documents.findByAsset(id);
  }

  @Post(':id/documents')
  @Roles(Role.SUPERVISOR)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload document to asset (Supervisor)' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: DocumentType,
    @Request() req: { user: { sub: string } },
  ) {
    return this.documents.upload(id, file, documentType, req.user.sub);
  }

  @Get(':id/documents/:docId/download')
  @ApiOperation({ summary: 'Get presigned download URL for document (all roles)' })
  getDocumentDownload(@Param('docId') docId: string) {
    return this.documents.getDownloadUrl(docId);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete document from asset (Supervisor)' })
  deleteDocument(@Param('docId') docId: string) {
    return this.documents.delete(docId);
  }
}
