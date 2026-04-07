import { api } from './api';

export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export const categoriesApi = {
  list: () => api.get<CategoryItem[]>('/asset-categories').then((r) => r.data),
};
