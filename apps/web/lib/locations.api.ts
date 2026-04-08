import { api } from './api';

export interface LocationItem {
  id: string;
  name: string;
  fullPath: string;
  level: number;
  code: string | null;
  description?: string | null;
  parentId?: string | null;
}

export interface CreateLocationPayload {
  name: string;
  level: number;
  code?: string;
  description?: string;
  parentId?: string;
}

export interface UpdateLocationPayload {
  name?: string;
  level?: number;
  code?: string;
  description?: string;
  parentId?: string;
}

export const locationsApi = {
  list: () => api.get<LocationItem[]>('/locations').then((r) => r.data),
  create: (payload: CreateLocationPayload) =>
    api.post<LocationItem>('/locations', payload).then((r) => r.data),
  update: (id: string, payload: UpdateLocationPayload) =>
    api.patch<LocationItem>(`/locations/${id}`, payload).then((r) => r.data),
  delete: (id: string) => api.delete(`/locations/${id}`),
};
