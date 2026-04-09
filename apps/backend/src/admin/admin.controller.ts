import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@gmao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  // ── System config ────────────────────────────────────────────────────────────

  @Get('system-config')
  @ApiOperation({ summary: 'List all system config entries (Admin)' })
  getSystemConfig() {
    return this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  }

  @Patch('system-config/:key')
  @ApiOperation({ summary: 'Update a system config value (Admin)' })
  async updateSystemConfig(
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.systemConfig.set(key, dto.value, req.user.sub);
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  // ── Audit log ────────────────────────────────────────────────────────────────

  @Get('audit-log')
  @ApiOperation({ summary: 'List audit log entries paginated (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  @ApiQuery({ name: 'actionType', required: false, type: String })
  async getAuditLog(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('targetType') targetType?: string,
    @Query('actionType') actionType?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const where = {
      ...(targetType ? { targetType } : {}),
      ...(actionType ? { actionType } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: pageNum, limit: limitNum };
  }
}
