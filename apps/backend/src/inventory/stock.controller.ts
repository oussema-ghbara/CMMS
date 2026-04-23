import {
  Controller, Get, Post, Param, Body, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@gmao/shared';
import { Part, StockMovement } from '@gmao/db';
import { InventoryService } from './inventory.service';
import { RecordIncomingStockDto } from './dto/record-incoming-stock.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { RecordPartReturnDto } from './dto/record-part-return.dto';
import { StockMovementResponseDto } from './dto/stock-movement-response.dto';

type AuthRequest = { user: { sub: string } };

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('')
export class StockController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock/low')
  @Roles(Role.STOREKEEPER, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Parts below minimum stock threshold, ordered by deficit severity' })
  getLowStock(): Promise<Part[]> {
    return this.inventory.findLowStockParts();
  }

  @Get('stock/movements/:partId')
  @Roles(Role.STOREKEEPER, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Full stock movement history for a part' })
  getMovements(@Param('partId') partId: string): Promise<StockMovementResponseDto[]> {
    return this.inventory.findMovementsByPart(partId);
  }

  @Post('stock/incoming')
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Record incoming stock delivery (Storekeeper)' })
  recordIncoming(@Body() dto: RecordIncomingStockDto, @Request() req: AuthRequest): Promise<{ part: Part; movement: StockMovement }> {
    return this.inventory.recordIncomingStock(dto, req.user.sub);
  }

  @Post('stock/adjustments')
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Record stock adjustment for physical discrepancy (Storekeeper)' })
  recordAdjustment(@Body() dto: StockAdjustmentDto, @Request() req: AuthRequest) {
    return this.inventory.recordAdjustment(dto, req.user.sub);
  }

  @Get('stock/analytics')
  @Roles(Role.STOREKEEPER, Role.SUPERVISOR)
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Analytics window in days (default 30)' })
  @ApiQuery({ name: 'deadStockDays', required: false, type: Number, description: 'Dead stock threshold in days (default 90)' })
  @ApiQuery({ name: 'longWaitingThresholdHours', required: false, type: Number, description: 'Hours threshold for long-waiting requests on ON_HOLD WOs (default 24)' })
  @ApiOperation({ summary: 'Inventory analytics: consumption, replenishment, dead stock, request processing, cost trend, long-waiting requests' })
  getAnalytics(
    @Query('periodDays') periodDays?: string,
    @Query('deadStockDays') deadStockDays?: string,
    @Query('longWaitingThresholdHours') longWaitingThresholdHours?: string,
  ): Promise<Record<string, unknown>> {
    const period = Math.max(1, parseInt(periodDays ?? '30', 10) || 30);
    const deadStock = Math.max(1, parseInt(deadStockDays ?? '90', 10) || 90);
    const longWaiting = Math.max(1, parseInt(longWaitingThresholdHours ?? '24', 10) || 24);
    return this.inventory.getAnalytics(period, deadStock, longWaiting);
  }
  @Post('stock/returns')
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Record part return to stock after WO cancellation (Storekeeper)' })
  recordReturn(
    @Body() dto: RecordPartReturnDto,
    @Request() req: AuthRequest,
  ): Promise<{ part: Part; movement: StockMovement }> {
    return this.inventory.recordPartReturn(dto.partId, dto.quantity, dto.workOrderId, req.user.sub);
  }

}
