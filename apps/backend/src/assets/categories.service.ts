import { Injectable, Logger } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateChecklistTemplateItemDto } from './dto/create-checklist-template-item.dto';
import { ReorderChecklistItemsDto } from './dto/reorder-checklist-items.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly repo: CategoriesRepository,
    private readonly prisma: PrismaService,
  ) {}

  findAll() {
    return this.repo.findAll();
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    const category = await this.repo.create(dto);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'CATEGORY_CREATED',
        targetType: 'Category',
        targetId: category.id,
        valueAfter: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      },
    });

    this.logger.log(`Category created: ${category.id} (${category.name}) by user ${actorId}`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const before = await this.repo.findById(id);
    const category = await this.repo.update(id, dto);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'CATEGORY_UPDATED',
        targetType: 'Category',
        targetId: id,
        valueBefore: {
          name: before.name,
          description: before.description,
          isActive: before.isActive,
        },
        valueAfter: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      },
    });

    this.logger.log(`Category updated: ${id} by user ${actorId}`);
    return category;
  }

  async deactivate(id: string, actorId: string) {
    const before = await this.repo.findById(id);
    const category = await this.repo.setActive(id, false);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'CATEGORY_DEACTIVATED',
        targetType: 'Category',
        targetId: id,
        valueBefore: {
          name: before.name,
          description: before.description,
          isActive: before.isActive,
        },
        valueAfter: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      },
    });

    this.logger.log(`Category deactivated: ${id} by user ${actorId}`);
    return category;
  }

  async activate(id: string, actorId: string) {
    const before = await this.repo.findById(id);
    const category = await this.repo.setActive(id, true);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'CATEGORY_ACTIVATED',
        targetType: 'Category',
        targetId: id,
        valueBefore: {
          name: before.name,
          description: before.description,
          isActive: before.isActive,
        },
        valueAfter: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      },
    });

    this.logger.log(`Category activated: ${id} by user ${actorId}`);
    return category;
  }

  addChecklistItem(categoryId: string, dto: CreateChecklistTemplateItemDto) {
    return this.repo.addChecklistItem(categoryId, dto);
  }

  updateChecklistItem(itemId: string, dto: Partial<CreateChecklistTemplateItemDto>) {
    return this.repo.updateChecklistItem(itemId, dto);
  }

  deleteChecklistItem(itemId: string) {
    return this.repo.deleteChecklistItem(itemId);
  }

  reorderChecklistItems(categoryId: string, dto: ReorderChecklistItemsDto) {
    return this.repo.reorderChecklistItems(categoryId, dto.orderedIds);
  }
}
