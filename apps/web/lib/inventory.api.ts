import { PartUnit, StockAdjustmentReason, StockMovementType } from '@gmao/shared';
import { api } from './api';

export interface PartDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

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

export interface InventoryAnalyticsPartRef {
  id: string;
  name: string;
  referenceCode: string;
  unitCost?: string;
}

export interface InventoryAnalyticsTopByQuantityItem {
  part: InventoryAnalyticsPartRef | null;
  totalQuantity: number;
}

export interface InventoryAnalyticsTopByCostItem {
  part: InventoryAnalyticsPartRef | null;
  totalCost: number;
}

export interface InventoryAnalyticsRequestMetrics {
  total: number;
  fulfilled: number;
  partiallyFulfilled: number;
  rejected: number;
  pending: number;
  fulfilmentRate: number;
  avgProcessingMinutes: number | null;
}

export interface InventoryCostTrendItem {
  month: string;
  totalCost: number;
}

export interface LongWaitingPartRequest {
  id: string;
  workOrderId: string;
  woReference: string;
  partId: string | null;
  partName: string | null;
  partReference: string | null;
  offCatalogDescription: string | null;
  quantityRequested: number;
  createdAt: string;
  waitingHours: number;
}

export interface InventoryAnalyticsResponse {
  periodDays: number;
  consumption: {
    topByQuantity: InventoryAnalyticsTopByQuantityItem[];
    topByCost: InventoryAnalyticsTopByCostItem[];
  };
  replenishment: Array<{
    partId: string;
    partName: string;
    partReference: string;
    timesTriggered: number;
  }>;
  deadStock: PartCatalogItem[];
  requests: InventoryAnalyticsRequestMetrics;
  costTrend: InventoryCostTrendItem[];
  longWaitingRequests: LongWaitingPartRequest[];
  longWaitingThresholdHours: number;
}

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  referenceId: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export interface RecordIncomingPayload {
  partId: string;
  quantity: number;
  supplierReference?: string;
  receivedDate?: string;
  unitCost?: number;
}

export interface StockAdjustmentPayload {
  partId: string;
  quantity: number;
  reason: StockAdjustmentReason;
  detail?: string;
}

export interface RecordPartReturnPayload {
  partId: string;
  quantity: number;
  workOrderId: string;
}

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

  recordIncoming: (payload: RecordIncomingPayload) =>
    api.post<PartCatalogItem>('/stock/incoming', payload).then((r) => r.data),

  recordAdjustment: (payload: StockAdjustmentPayload) =>
    api.post<PartCatalogItem>('/stock/adjustments', payload).then((r) => r.data),

  getMovements: (partId: string) =>
    api.get<StockMovement[]>(`/stock/movements/${partId}`).then((r) => r.data),

  getLowStock: () => api.get<PartCatalogItem[]>('/stock/low').then((r) => r.data),

  getAnalytics: (params?: { periodDays?: number; deadStockDays?: number; longWaitingThresholdHours?: number }) =>
    api.get<InventoryAnalyticsResponse>('/stock/analytics', { params }).then((r) => r.data),

  recordReturn: (payload: RecordPartReturnPayload) =>
    api.post<{ part: PartCatalogItem; movement: StockMovement }>('/stock/returns', payload).then((r) => r.data),

  listPartDocuments: (partId: string) =>
    api.get<PartDocument[]>(`/parts/${partId}/documents`).then((r) => r.data),

  uploadPartDocument: (partId: string, file: File, documentType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return api.post<PartDocument>(`/parts/${partId}/documents`, form).then((r) => r.data);
  },

  getPartDocumentDownloadUrl: (partId: string, docId: string) =>
    api.get<string>(`/parts/${partId}/documents/${docId}/download`).then((r) => r.data),

  getPartDocumentVersionHistory: (partId: string, docId: string) =>
    api.get<PartDocument[]>(`/parts/${partId}/documents/${docId}/versions`).then((r) => r.data),

  deletePartDocument: (partId: string, docId: string) =>
    api.delete(`/parts/${partId}/documents/${docId}`),
};
