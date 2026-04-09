import {
  Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@gmao/shared';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type';
import type { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user: AccessTokenPayload;
}

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all locations (all roles)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get location by ID (all roles)' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create location (Admin)' })
  create(
    @Body() dto: CreateLocationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.create(dto, req.user.sub);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update location (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete location (Admin) — fails if it has children or assets' })
  delete(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.delete(id, req.user.sub);
  }
}
