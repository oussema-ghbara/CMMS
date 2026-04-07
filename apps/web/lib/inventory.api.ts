import { PartUnit } from '@gmao/shared';
import { api } from './api';

export interface PartCatalogItem {
  id: string;
  name: string;
  referenceCode: string;
  description: string | null;
  unit: PartUnit;
  currentStock: number;
  minimumStockThreshold: number;
  warehouseLocation: string | null;
  unitCost: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartCatalogResponse {
  data: PartCatalogItem[];
  total: number;
}

export interface CreatePartPayload {
  name: string;
  referenceCode: string;
  description?: string;
  unit: PartUnit;
  minimumStockThreshold?: number;
  warehouseLocation?: string;
  unitCost?: number;
}

export type UpdatePartPayload = Partial<CreatePartPayload>;

export const inventoryApi = {
  getParts: (params?: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) => api.get<PartCatalogResponse>('/parts', { params }).then((r) => r.data),

  createPart: (payload: CreatePartPayload) =>
    api.post<PartCatalogItem>('/parts', payload).then((r) => r.data),

  updatePart: (id: string, payload: UpdatePartPayload) =>
    api.patch<PartCatalogItem>(`/parts/${id}`, payload).then((r) => r.data),

  deactivatePart: (id: string) => api.patch<PartCatalogItem>(`/parts/${id}/deactivate`).then((r) => r.data),

  activatePart: (id: string) => api.patch<PartCatalogItem>(`/parts/${id}/activate`).then((r) => r.data),
};
