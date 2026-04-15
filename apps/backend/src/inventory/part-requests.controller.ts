import {
  Controller, Get, Post, Patch, Param, Body, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { PartRequestsService } from './part-requests.service';
import { SubmitPartRequestDto } from './dto/submit-part-request.dto';
import { FulfillPartRequestDto } from './dto/fulfill-part-request.dto';
import { RejectPartRequestDto } from './dto/reject-part-request.dto';
import { PartRequestQueryDto } from './dto/part-request-query.dto';

type AuthRequest = { user: { sub: string } };

@ApiTags('Part Requests')
@ApiBearerAuth()
@OperationalRoles()
@Controller('')
export class PartRequestsController {
  constructor(private readonly partRequests: PartRequestsService) {}

  // ── Technician: submit from within a WO context ───────────────────

  @Post('work-orders/:woId/part-requests')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Submit part request for a work order (assigned Technician)' })
  submit(
    @Param('woId') woId: string,
    @Body() dto: SubmitPartRequestDto,
    @Request() req: AuthRequest,
  ) {
    return this.partRequests.submit(woId, dto, req.user.sub);
  }

  @Get('work-orders/:woId/part-requests')
  @ApiOperation({ summary: 'List part requests for a work order (all roles)' })
  findByWorkOrder(@Param('woId') woId: string) {
    return this.partRequests.findByWorkOrder(woId);
  }

  // ── Storekeeper: request queue ────────────────────────────────────

  @Get('part-requests')
  @Roles(Role.STOREKEEPER)
  @ApiOperation({ summary: 'Storekeeper part request queue — sorted by WO priority then creation time' })
  findQueue(@Query() query: PartRequestQueryDto) {
    return this.partRequests.findQueue(query);
  }

  @Patch('part-requests/:id/fulfill')
  @Roles(Role.STOREKEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fulfill part request — creates OUTGOING stock movement (Storekeeper)' })
  fulfill(
    @Param('id') id: string,
    @Body() dto: FulfillPartRequestDto,
    @Request() req: AuthRequest,
  ) {
    return this.partRequests.fulfill(id, dto, req.user.sub);
  }

  @Patch('part-requests/:id/reject')
  @Roles(Role.STOREKEEPER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject part request (Storekeeper)' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPartRequestDto,
    @Request() req: AuthRequest,
  ) {
    return this.partRequests.reject(id, dto, req.user.sub);
  }
}
