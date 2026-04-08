import { api } from './api';

export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
}

export const categoriesApi = {
  list: () => api.get<CategoryItem[]>('/asset-categories').then((r) => r.data),
  create: (payload: CreateCategoryPayload) =>
    api.post<CategoryItem>('/asset-categories', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCategoryPayload) =>
    api.patch<CategoryItem>(`/asset-categories/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) => api.patch<CategoryItem>(`/asset-categories/${id}/deactivate`).then((r) => r.data),
  activate: (id: string) => api.patch<CategoryItem>(`/asset-categories/${id}/activate`).then((r) => r.data),
};
