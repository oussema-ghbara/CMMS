import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetCategory, ChecklistTemplateItem } from '@gmao/db';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateChecklistTemplateItemDto } from './dto/create-checklist-template-item.dto';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AssetCategory[]> {
    return this.prisma.assetCategory.findMany({
      orderBy: { name: 'asc' },
      include: { checklistTemplateItems: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async findById(id: string): Promise<AssetCategory & { checklistTemplateItems: ChecklistTemplateItem[] }> {
    const category = await this.prisma.assetCategory.findUnique({
      where: { id },
      include: { checklistTemplateItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<AssetCategory> {
    const existing = await this.prisma.assetCategory.findFirst({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Category with name "${dto.name}" already exists`);

    return this.prisma.assetCategory.create({ data: dto });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<AssetCategory> {
    await this.findById(id);
    if (dto.name) {
      const existing = await this.prisma.assetCategory.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (existing) throw new ConflictException(`Category with name "${dto.name}" already exists`);
    }
    return this.prisma.assetCategory.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean): Promise<AssetCategory> {
    await this.findById(id);
    return this.prisma.assetCategory.update({ where: { id }, data: { isActive } });
  }

  async addChecklistItem(
    categoryId: string,
    dto: CreateChecklistTemplateItemDto,
  ): Promise<ChecklistTemplateItem> {
    await this.findById(categoryId);
    return this.prisma.checklistTemplateItem.create({ data: { ...dto, categoryId } });
  }

  async updateChecklistItem(
    itemId: string,
    dto: Partial<CreateChecklistTemplateItemDto>,
  ): Promise<ChecklistTemplateItem> {
    const item = await this.prisma.checklistTemplateItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist template item ${itemId} not found`);
    return this.prisma.checklistTemplateItem.update({ where: { id: itemId }, data: dto });
  }

  async deleteChecklistItem(itemId: string): Promise<void> {
    const item = await this.prisma.checklistTemplateItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist template item ${itemId} not found`);
    await this.prisma.checklistTemplateItem.delete({ where: { id: itemId } });
  }

  async reorderChecklistItems(categoryId: string, items: { id: string; sortOrder: number }[]): Promise<void> {
    await this.findById(categoryId);
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.checklistTemplateItem.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );
  }
}
