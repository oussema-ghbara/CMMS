import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, Request,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { DocumentType } from '@gmao/db';
import { PreventivePlansService } from './preventive-plans.service';
import { DocumentsService } from '../assets/documents.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanQueryDto } from './dto/plan-query.dto';
import { CreatePlanChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdatePlanChecklistItemDto } from './dto/update-checklist-item.dto';
import { ReorderPlanChecklistItemsDto } from './dto/reorder-checklist-items.dto';
import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class CalendarQueryDto {
  @ApiPropertyOptional({ description: 'ISO date string for start of preview window (default: today)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO date string for end of preview window (default: today + 90 days)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

@ApiTags('Preventive Plans')
@ApiBearerAuth()
@OperationalRoles()
@Controller('preventive-plans')
export class PreventivePlansController {
  constructor(
    private readonly service: PreventivePlansService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List preventive plans with filters and pagination (all roles)' })
  findAll(@Query() query: PlanQueryDto) {
    return this.service.findAll(query);
  }

  @Get('calendar')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Foreseeable WO generation calendar for active plans (Supervisor) — spec §2.9',
    description:
      'Returns projected WO generation events within the requested date window. ' +
      'Defaults to today through today + 90 days. Maximum 200 events per plan.',
  })
  getCalendar(@Query() query: CalendarQueryDto) {
    const now = new Date();
    const defaultTo = new Date(now);
    defaultTo.setDate(defaultTo.getDate() + 90);

    const fromDate = query.fromDate ? new Date(query.fromDate) : now;
    const toDate = query.toDate ? new Date(query.toDate) : defaultTo;

    return this.service.getCalendarPreview(fromDate, toDate);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan detail including checklist template (all roles)' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Create preventive plan (Supervisor)' })
  create(@Body() dto: CreatePlanDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Update plan — asset cannot be changed (Supervisor)' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/activate')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate plan — resumes scheduled WO generation (Supervisor)' })
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate plan — stops future WO generation (Supervisor)' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post(':id/trigger')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually enqueue WO generation now — returns BullMQ job ID (Supervisor)' })
  triggerNow(@Param('id') id: string) {
    return this.service.triggerNow(id);
  }

  @Post(':id/checklist-items')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Add checklist template item to plan (Supervisor)' })
  addChecklistItem(@Param('id') id: string, @Body() dto: CreatePlanChecklistItemDto) {
    return this.service.addChecklistItem(id, dto);
  }

  @Patch(':id/checklist-items/:itemId')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Update checklist template item (Supervisor)' })
  updateChecklistItem(
    @Param('id') planId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePlanChecklistItemDto,
  ) {
    return this.service.updateChecklistItem(planId, itemId, dto);
  }

  @Delete(':id/checklist-items/:itemId')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete checklist template item (Supervisor)' })
  deleteChecklistItem(@Param('id') planId: string, @Param('itemId') itemId: string) {
    return this.service.deleteChecklistItem(planId, itemId);
  }

  @Post(':id/checklist-items/reorder')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder checklist template items (Supervisor)' })
  reorderChecklistItems(@Param('id') id: string, @Body() dto: ReorderPlanChecklistItemsDto) {
    return this.service.reorderChecklistItems(id, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List current-version documents for a plan (all roles)' })
  listDocuments(@Param('id') id: string) {
    return this.documents.findByPlan(id);
  }

  @Post(':id/documents')
  @Roles(Role.SUPERVISOR)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload document to a preventive plan (Supervisor)' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: DocumentType,
    @Request() req: { user: { sub: string } },
  ) {
    return this.documents.uploadForPlan(id, file, documentType, req.user.sub);
  }

  @Get(':id/documents/:docId/download')
  @ApiOperation({ summary: 'Get presigned download URL for a plan document (all roles)' })
  getDocumentDownload(@Param('docId') docId: string) {
    return this.documents.getDownloadUrl(docId);
  }

  @Get(':id/documents/:docId/versions')
  @ApiOperation({ summary: 'List all versions of a plan document (all roles)' })
  getDocumentVersionHistory(@Param('docId') docId: string) {
    return this.documents.getVersionHistory(docId);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a plan document (Supervisor)' })
  deleteDocument(@Param('docId') docId: string) {
    return this.documents.delete(docId);
  }
}
