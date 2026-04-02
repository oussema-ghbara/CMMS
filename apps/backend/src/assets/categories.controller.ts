import {
  Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@gmao/shared';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateChecklistTemplateItemDto } from './dto/create-checklist-template-item.dto';
import { ReorderChecklistItemsDto } from './dto/reorder-checklist-items.dto';

@ApiTags('Asset Categories')
@ApiBearerAuth()
@Controller('asset-categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  // Checklist template item management — Supervisor only
  @Post(':id/checklist-items')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'Add checklist template item to category (Supervisor)' })
  addChecklistItem(@Param('id') id: string, @Body() dto: CreateChecklistTemplateItemDto) {
    return this.service.addChecklistItem(id, dto);
  }

  @Patch(':id/checklist-items/:itemId')
  @Roles(Role.SUPERVISOR)
  updateChecklistItem(
    @Param('itemId') itemId: string,
    @Body() dto: Partial<CreateChecklistTemplateItemDto>,
  ) {
    return this.service.updateChecklistItem(itemId, dto);
  }

  @Delete(':id/checklist-items/:itemId')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChecklistItem(@Param('itemId') itemId: string) {
    return this.service.deleteChecklistItem(itemId);
  }

  @Post(':id/checklist-items/reorder')
  @Roles(Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  reorder(@Param('id') id: string, @Body() dto: ReorderChecklistItemsDto) {
    return this.service.reorderChecklistItems(id, dto);
  }
}
