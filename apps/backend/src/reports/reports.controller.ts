import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ConvertToWoDto } from './dto/convert-to-wo.dto';
import { RejectReportDto } from './dto/reject-report.dto';
import { DeferReportDto } from './dto/defer-report.dto';
import { ArchiveReportDto } from './dto/archive-report.dto';
import { AddCommentDto } from './dto/add-comment.dto';

@ApiTags('Problem Reports')
@ApiBearerAuth()
@OperationalRoles()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List problem reports with filters (all roles)' })
  findAll(@Query() query: ReportQueryDto) {
    return this.reports.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get problem report detail (all roles)' })
  findById(@Param('id') id: string) {
    return this.reports.findById(id);
  }

  @Post()
  @Roles(Role.REQUESTER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Submit a problem report (Requester, Technician)' })
  submit(@Body() dto: CreateReportDto, @Request() req: any) {
    return this.reports.submit(dto, req.user.sub);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a report (all roles)' })
  addComment(@Param('id') id: string, @Body() dto: AddCommentDto, @Request() req: any) {
    return this.reports.addComment(id, dto, req.user.sub);
  }

  @Patch(':id/comments/:commentId/acknowledge')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Acknowledge a comment on a report (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  acknowledgeComment(@Param('id') id: string, @Param('commentId') commentId: string, @Request() req: any) {
    return this.reports.acknowledgeComment(id, commentId, req.user.sub);
  }

  @Post(':id/convert')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Convert report to work order — PENDING → CONVERTED (Supervisor)' })
  convert(@Param('id') id: string, @Body() dto: ConvertToWoDto, @Request() req: any) {
    return this.reports.convert(id, dto, req.user.sub);
  }

  @Patch(':id/reject')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Reject a report — PENDING → REJECTED (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: RejectReportDto, @Request() req: any) {
    return this.reports.reject(id, dto, req.user.sub);
  }

  @Patch(':id/defer')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Defer a report — PENDING → DEFERRED (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  defer(@Param('id') id: string, @Body() dto: DeferReportDto, @Request() req: any) {
    return this.reports.defer(id, dto, req.user.sub);
  }

  @Patch(':id/reopen')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Reopen a deferred report — DEFERRED → PENDING (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  reopen(@Param('id') id: string, @Request() req: any) {
    return this.reports.reopen(id, req.user.sub);
  }

  @Patch(':id/archive')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Archive a report — PENDING/DEFERRED → ARCHIVED (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string, @Body() dto: ArchiveReportDto, @Request() req: any) {
    return this.reports.archive(id, dto, req.user.sub);
  }
}
