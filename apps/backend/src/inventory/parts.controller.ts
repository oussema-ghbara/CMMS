import {
  Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { OperationalRoles } from '../common/decorators/operational-roles.decorator';
import { Role } from '@gmao/shared';
import { Part } from '@gmao/db';
import { InventoryService } from './inventory.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { PartQueryDto } from './dto/part-query.dto';

@ApiTags('Parts')
@ApiBearerAuth()
@OperationalRoles()
@Controller('parts')
export class PartsController {
  constructor(private readonly inventory: InventoryService) {}

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
}
