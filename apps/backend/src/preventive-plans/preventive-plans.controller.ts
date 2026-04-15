import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { PreventivePlansService } from './preventive-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanQueryDto } from './dto/plan-query.dto';
import { CreatePlanChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdatePlanChecklistItemDto } from './dto/update-checklist-item.dto';
import { ReorderPlanChecklistItemsDto } from './dto/reorder-checklist-items.dto';

@ApiTags('Preventive Plans')
@ApiBearerAuth()
@OperationalRoles()
@Controller('preventive-plans')
export class PreventivePlansController {
  constructor(private readonly service: PreventivePlansService) {}

  @Get()
  @ApiOperation({ summary: 'List preventive plans with filters and pagination (all roles)' })
  findAll(@Query() query: PlanQueryDto) {
    return this.service.findAll(query);
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

  // ── Checklist template management ──────────────────────────────────

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
}
