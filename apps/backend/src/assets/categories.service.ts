import { Injectable } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateChecklistTemplateItemDto } from './dto/create-checklist-template-item.dto';
import { ReorderChecklistItemsDto } from './dto/reorder-checklist-items.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  findAll() {
    return this.repo.findAll();
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  create(dto: CreateCategoryDto) {
    return this.repo.create(dto);
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.repo.update(id, dto);
  }

  deactivate(id: string) {
    return this.repo.setActive(id, false);
  }

  activate(id: string) {
    return this.repo.setActive(id, true);
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
