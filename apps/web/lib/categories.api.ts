import { api } from './api';

export type ChecklistTaskType =
  | 'INSPECTION'
  | 'MEASUREMENT'
  | 'LUBRICATION'
  | 'CLEANING'
  | 'REPLACEMENT'
  | 'CALIBRATION'
  | 'ADJUSTMENT';

export interface CategoryChecklistTemplateItem {
  id: string;
  categoryId: string;
  description: string;
  taskType: ChecklistTaskType;
  expectedCondition: string | null;
  isMandatory: boolean;
  sortOrder: number;
  autoCreateCorrectiveWO: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface CategoryDetail extends CategoryItem {
  checklistTemplateItems: CategoryChecklistTemplateItem[];
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
}

export interface CreateChecklistTemplateItemPayload {
  description: string;
  taskType: ChecklistTaskType;
  expectedCondition?: string;
  isMandatory?: boolean;
  sortOrder?: number;
  autoCreateCorrectiveWO?: boolean;
}

export type UpdateChecklistTemplateItemPayload = Partial<CreateChecklistTemplateItemPayload>;

export const categoriesApi = {
  list: () => api.get<CategoryItem[]>('/asset-categories').then((r) => r.data),

  getById: (id: string) => api.get<CategoryDetail>(`/asset-categories/${id}`).then((r) => r.data),

  create: (payload: CreateCategoryPayload) =>
    api.post<CategoryItem>('/asset-categories', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCategoryPayload) =>
    api.patch<CategoryItem>(`/asset-categories/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) => api.patch<CategoryItem>(`/asset-categories/${id}/deactivate`).then((r) => r.data),
  activate: (id: string) => api.patch<CategoryItem>(`/asset-categories/${id}/activate`).then((r) => r.data),

  // ── Checklist template items (Supervisor only) ──────────────────────────────

  addChecklistItem: (categoryId: string, payload: CreateChecklistTemplateItemPayload) =>
    api
      .post<CategoryChecklistTemplateItem>(`/asset-categories/${categoryId}/checklist-items`, payload)
      .then((r) => r.data),

  updateChecklistItem: (categoryId: string, itemId: string, payload: UpdateChecklistTemplateItemPayload) =>
    api
      .patch<CategoryChecklistTemplateItem>(`/asset-categories/${categoryId}/checklist-items/${itemId}`, payload)
      .then((r) => r.data),

  deleteChecklistItem: (categoryId: string, itemId: string) =>
    api.delete(`/asset-categories/${categoryId}/checklist-items/${itemId}`),

  reorderChecklistItems: (categoryId: string, items: { id: string; sortOrder: number }[]) =>
    api
      .post<void>(`/asset-categories/${categoryId}/checklist-items/reorder`, { items })
      .then((r) => r.data),
};
