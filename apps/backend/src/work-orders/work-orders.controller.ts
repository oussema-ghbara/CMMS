import {
  Controller, Get, Post, Patch, Param, Body, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { calculateWorkOrderCostSummary, WorkOrderCostSource } from './work-order-costs';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { WorkOrder } from '@gmao/db';
import { WorkOrdersService } from './work-orders.service';
import { AssignmentService } from './assignment.service';
import { InterventionService } from './intervention.service';
import { OnHoldService } from './on-hold.service';
import { ValidationService } from './validation.service';
import { ChecklistService } from './checklist.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { WorkOrderQueryDto } from './dto/work-order-query.dto';
import { AssignTechnicianDto } from './dto/assign-technician.dto';
import { ReassignTechnicianDto } from './dto/reassign-technician.dto';
import { PromoteTechnicianDto } from './dto/promote-technician.dto';
import { ContributorBlockDto } from './dto/contributor-block.dto';
import { PutOnHoldDto } from './dto/put-on-hold.dto';
import { ResolveHoldDto } from './dto/resolve-hold.dto';
import { UpdateHoldMetadataDto } from './dto/update-hold-metadata.dto';
import { SubmitClosureDto } from './dto/submit-closure.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { ValidateWorkOrderDto } from './dto/validate-work-order.dto';
import { CompleteChecklistItemDto } from './dto/complete-checklist-item.dto';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import { DurationHintsQueryDto } from './dto/duration-hints-query.dto';
import { WorkOrderType } from '@gmao/shared';

type AuthRequest = { user: { sub: string; roles: Role[] } };

@ApiTags('Work Orders')
@ApiBearerAuth()
@OperationalRoles()
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly assignment: AssignmentService,
    private readonly intervention: InterventionService,
    private readonly onHold: OnHoldService,
    private readonly validation: ValidationService,
    private readonly checklist: ChecklistService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List work orders with filters (all roles)' })
  findAll(@Query() query: WorkOrderQueryDto) {
    return this.workOrders.findAll(query);
  }

  @Get('analytics')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Full work order analytics across 5 KPI categories (Supervisor) — spec §9.8' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Analytics window in days (default 30)' })
  @ApiQuery({ name: 'categoryId', required: false, type: String, description: 'Filter by asset category ID' })
  getAnalytics(@Query('periodDays') periodDays?: string, @Query('categoryId') categoryId?: string) {
    const period = Math.max(1, parseInt(periodDays ?? '30', 10) || 30);
    return this.workOrders.getAnalytics(period, categoryId || undefined);
  }

  @Get('asset-health')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Assets breaching recurring-failure threshold (Supervisor) — spec §9.3' })
  @ApiQuery({ name: 'thresholdCount', required: false, type: Number, description: 'Min corrective WOs to flag (default 3)' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Lookback window in days (default 90)' })
  getAssetHealth(
    @Query('thresholdCount') thresholdCount?: string,
    @Query('periodDays') periodDays?: string,
  ) {
    const threshold = Math.max(1, parseInt(thresholdCount ?? '3', 10) || 3);
    const period = Math.max(1, parseInt(periodDays ?? '90', 10) || 90);
    return this.workOrders.getRecurringFailureAssets(threshold, period);
  }

  @Get('technician-load')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Per-technician open WO count + CRITICAL flag (Supervisor) — spec §9.3' })
  getTechnicianLoad() {
    return this.workOrders.getTechnicianLoad();
  }

  @Get('duration-hints')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Historical duration averages for WO creation estimation (Supervisor) — spec §9.2',
    description:
      'Returns average closure times: last 5 WOs on the asset, category average (last 50), ' +
      'and optionally the selected technician\'s average (last 10 of same type).',
  })
  @ApiQuery({ name: 'assetId', required: true, type: String })
  @ApiQuery({ name: 'type', required: true, enum: WorkOrderType })
  @ApiQuery({ name: 'technicianId', required: false, type: String })
  getDurationHints(@Query() query: DurationHintsQueryDto) {
    return this.workOrders.getDurationHints(query.assetId, query.type, query.technicianId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full work order detail (all roles)' })
  async findById(@Param('id') id: string) {
    const wo = await this.workOrders.findById(id);
    const costSummary = calculateWorkOrderCostSummary(wo as unknown as WorkOrderCostSource);
    return { ...wo, costSummary };
  }

  @Get(':id/report')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Get a presigned download URL for the closed WO PDF — generates on demand if not yet stored' })
  getReportUrl(@Param('id') id: string): Promise<{ url: string }> {
    return this.workOrders.getReportUrl(id);
  }

  @Post()
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Create work order (Supervisor) — with optional pre-assignment (spec §9.2)' })
  async create(@Body() dto: CreateWorkOrderDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    const wo = await this.workOrders.create(dto, req.user.sub);

    if (dto.principalTechnicianId) {
      await this.workOrders.publish(wo.id, req.user.sub);
      return this.assignment.assign(
        wo.id,
        { principalTechnicianId: dto.principalTechnicianId, contributorIds: dto.contributorIds },
        req.user.sub,
      );
    }

    return wo;
  }

  @Post(':id/follow-up')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Create follow-up WO from a CLOSED COULD_NOT_INTERVENE WO (Supervisor) — spec §1.4 / §9.5',
  })
  createFollowUp(
    @Param('id') id: string,
    @Body() dto: CreateFollowUpDto,
    @Request() req: AuthRequest,
  ): Promise<WorkOrder> {
    return this.workOrders.createFollowUp(id, dto, req.user.sub);
  }

  @Patch(':id/publish')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Publish draft work order — DRAFT → OPEN (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.workOrders.publish(id, req.user.sub);
  }

  @Patch(':id/cancel')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Cancel work order (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Body() dto: CancelWorkOrderDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.workOrders.cancel(id, dto, req.user.sub);
  }

  @Patch(':id/priority')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Change priority (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  changePriority(@Param('id') id: string, @Body() dto: ChangePriorityDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.workOrders.changePriority(id, dto, req.user.sub);
  }

  @Patch(':id/authorize-simultaneous')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Authorize simultaneous maintenance (Supervisor)',
    description:
      'Allows a second work order to start on an asset that already has an active ' +
      'IN_PROGRESS work order. The principal technician is notified so they can proceed.',
  })
  @HttpCode(HttpStatus.OK)
  authorizeSimultaneous(@Param('id') id: string, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.workOrders.authorizeSimultaneousMaintenance(id, req.user.sub);
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Status history (all roles)' })
  getStatusHistory(@Param('id') id: string) {
    return this.workOrders.getStatusHistory(id);
  }

  // ── Assignment ───────────────────────────────────────────────────

  @Patch(':id/assign')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Assign principal + optional contributors — OPEN → ASSIGNED (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  assign(@Param('id') id: string, @Body() dto: AssignTechnicianDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.assignment.assign(id, dto, req.user.sub);
  }

  @Patch(':id/reassign')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Reassign principal technician (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  reassign(@Param('id') id: string, @Body() dto: ReassignTechnicianDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.assignment.reassign(id, dto, req.user.sub);
  }

  @Patch(':id/promote')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Promote contributor to principal (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  promote(@Param('id') id: string, @Body() dto: PromoteTechnicianDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.assignment.promote(id, dto, req.user.sub);
  }

  @Post(':id/block')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Raise contributor block flag (Contributor Technician)' })
  raiseBlock(@Param('id') id: string, @Body() dto: ContributorBlockDto, @Request() req: AuthRequest) {
    return this.assignment.raiseContributorBlock(id, dto, req.user.sub);
  }

  @Patch(':id/block/:blockId/resolve')
  @Roles(Role.SUPERVISOR, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Resolve contributor block flag (Supervisor or Principal Technician)' })
  @HttpCode(HttpStatus.OK)
  resolveBlock(@Param('blockId') blockId: string) {
    return this.assignment.resolveContributorBlock(blockId);
  }

  // ── Intervention ─────────────────────────────────────────────────

  @Patch(':id/start')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Start work order — ASSIGNED → IN_PROGRESS (Principal Technician)' })
  @HttpCode(HttpStatus.OK)
  start(@Param('id') id: string, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.intervention.start(id, req.user.sub);
  }

  @Patch(':id/submit-closure')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Submit closure — IN_PROGRESS → PENDING_VALIDATION (Principal Technician)' })
  @HttpCode(HttpStatus.OK)
  submitClosure(@Param('id') id: string, @Body() dto: SubmitClosureDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.intervention.submitClosure(id, dto, req.user.sub);
  }

  // ── On Hold ──────────────────────────────────────────────────────

  @Patch(':id/on-hold')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Put on hold — IN_PROGRESS → ON_HOLD (Principal Technician)' })
  @HttpCode(HttpStatus.OK)
  putOnHold(@Param('id') id: string, @Body() dto: PutOnHoldDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.onHold.putOnHold(id, dto, req.user.sub);
  }

  @Patch(':id/resume')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Resume from hold — ON_HOLD → IN_PROGRESS (Principal Technician)' })
  @HttpCode(HttpStatus.OK)
  resume(@Param('id') id: string, @Body() dto: ResolveHoldDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.onHold.resume(id, dto, req.user.sub);
  }

  @Patch(':id/hold-metadata')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Update hold metadata (Supervisor)',
    description:
      'Set expectedResolutionDate, retryDate, or resolution plan note on an ON_HOLD work order ' +
      'without changing its state. The resolution note must be authored by the supervisor — not ' +
      'the technician on resume (§9.4 + §6.1 fix).',
  })
  @HttpCode(HttpStatus.OK)
  updateHoldMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateHoldMetadataDto,
    @Request() req: AuthRequest,
  ): Promise<WorkOrder> {
    return this.onHold.updateHoldMetadata(id, dto, req.user.sub);
  }

  // ── Validation ───────────────────────────────────────────────────

  @Patch(':id/validate')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Validate and close — PENDING_VALIDATION → CLOSED (Supervisor)',
    description:
      'When the last intervention result is COULD_NOT_INTERVENE, ' +
      'assetStatusOverride is mandatory and the supervisor must explicitly ' +
      'declare the post-validation asset status.',
  })
  @HttpCode(HttpStatus.OK)
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateWorkOrderDto,
    @Request() req: AuthRequest,
  ): Promise<WorkOrder> {
    return this.validation.validate(id, req.user.sub, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Reject closure — PENDING_VALIDATION → IN_PROGRESS (Supervisor)' })
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: RejectValidationDto, @Request() req: AuthRequest): Promise<WorkOrder> {
    return this.validation.reject(id, dto, req.user.sub);
  }

  // ── Checklist ────────────────────────────────────────────────────

  @Get(':id/checklist')
  @ApiOperation({ summary: 'Get checklist items (all roles)' })
  getChecklist(@Param('id') id: string) {
    return this.checklist.getChecklist(id);
  }

  @Patch(':id/checklist/:itemId')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Complete checklist item (assigned Technician — offline-safe)' })
  @HttpCode(HttpStatus.OK)
  completeChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CompleteChecklistItemDto,
    @Request() req: AuthRequest,
  ) {
    return this.checklist.completeItem(id, itemId, dto, req.user.sub);
  }
}
