import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@gmao/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateEmailNotificationsDto } from './dto/update-email-notifications.dto';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Self-service endpoints (all authenticated roles) ────────────────────────

  @Get('technicians')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'List all active technicians (Admin + Supervisor) — used in WO creation form §9.2' })
  listTechnicians(): Promise<UserResponseDto[]> {
    return this.usersService.listActiveTechnicians();
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.STOREKEEPER, Role.TECHNICIAN, Role.REQUESTER)
  @ApiOperation({ summary: 'Get own profile (all authenticated roles) — spec §11' })
  getMe(@Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.usersService.getMe(req.user.sub);
  }

  @Get('me/preferences')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.STOREKEEPER, Role.TECHNICIAN, Role.REQUESTER)
  @ApiOperation({ summary: 'Get own notification preferences (all authenticated roles) — spec §12.1' })
  getMyPreferences(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ emailNotificationsEnabled: boolean }> {
    return this.usersService.getPreferences(req.user.sub);
  }

  @Patch('me/email-notifications')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.STOREKEEPER, Role.TECHNICIAN, Role.REQUESTER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own email notification preference (all authenticated roles) — spec §12.1' })
  updateEmailNotifications(
    @Body() dto: UpdateEmailNotificationsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ emailNotificationsEnabled: boolean }> {
    return this.usersService.updateEmailNotificationsPreference(req.user.sub, dto.enabled);
  }

  // ── Admin-only endpoints ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all users (Admin)' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'isActive', type: Boolean, required: false })
  findAll(
    @Query('role') role?: Role,
    @Query('isActive') isActive?: string,
  ): Promise<UserResponseDto[]> {
    return this.usersService.findAll({
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id (Admin)' })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create user and send setup email (Admin)' })
  create(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.create(dto, req.user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user name, email, or roles (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, req.user.sub);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate user and revoke all tokens (Admin)' })
  deactivate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.deactivate(id, req.user.sub);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivate a deactivated user (Admin)' })
  reactivate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.reactivate(id, req.user.sub);
  }

  @Post(':id/resend-setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resend account setup email (Admin)' })
  resendSetup(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.usersService.resendSetup(id, req.user.sub);
  }
}
