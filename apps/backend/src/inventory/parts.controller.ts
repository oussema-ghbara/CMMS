import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, Request,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { DocumentType, Part } from '@gmao/db';
import { InventoryService } from './inventory.service';
import { DocumentsService } from '../assets/documents.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { PartQueryDto } from './dto/part-query.dto';

@ApiTags('Parts')
@ApiBearerAuth()
@OperationalRoles()
@Controller('parts')
export class PartsController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List parts catalog with search and pagination (all roles)' })
  findAll(@Query() query: PartQueryDto): Promise<{ data: Part[]; total: number }> {
    return this.inventory.findAllParts(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get part detail (all roles)' })
  findById(@Param('id') id: string): Promise<Part> {
    return this.inventory.findPartById(id);
  }

  @Post()
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Create part (Storekeeper)' })
  create(@Body() dto: CreatePartDto): Promise<Part> {
    return this.inventory.createPart(dto);
  }

  @Patch(':id')
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Update part (Storekeeper)' })
  update(@Param('id') id: string, @Body() dto: UpdatePartDto): Promise<Part> {
    return this.inventory.updatePart(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.STOREKEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate part (Storekeeper) — preserves all history' })
  deactivate(@Param('id') id: string): Promise<Part> {
    return this.inventory.deactivatePart(id);
  }

  @Patch(':id/activate')
  @Roles(Role.STOREKEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-activate part (Storekeeper)' })
  activate(@Param('id') id: string): Promise<Part> {
    return this.inventory.activatePart(id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List current-version documents for a part (all roles)' })
  listDocuments(@Param('id') id: string) {
    return this.documents.findByPart(id);
  }

  @Post(':id/documents')
  @Roles(Role.SUPERVISOR, Role.STOREKEEPER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload document for a part (Supervisor or Storekeeper)' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: DocumentType,
    @Request() req: { user: { sub: string } },
  ) {
    return this.documents.uploadForPart(id, file, documentType, req.user.sub);
  }

  @Get(':id/documents/:docId/download')
  @ApiOperation({ summary: 'Get presigned download URL for a part document (all roles)' })
  getDocumentDownload(@Param('docId') docId: string) {
    return this.documents.getDownloadUrl(docId);
  }

  @Get(':id/documents/:docId/versions')
  @ApiOperation({ summary: 'List all versions of a part document (all roles)' })
  getDocumentVersionHistory(@Param('docId') docId: string) {
    return this.documents.getVersionHistory(docId);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.SUPERVISOR, Role.STOREKEEPER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a part document (Supervisor or Storekeeper)' })
  deleteDocument(@Param('docId') docId: string) {
    return this.documents.delete(docId);
  }
}
