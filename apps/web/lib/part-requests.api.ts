import { api } from './api';
import { PartRequestRejectionReason, PartRequestStatus } from '@gmao/shared';

export interface PartRequestQueueItem {
  id: string;
  workOrderId: string;
  requesterId: string;
  partId: string | null;
  offCatalogDescription: string | null;
  quantityRequested: number;
  quantityFulfilled: number;
  note: string | null;
  status: PartRequestStatus;
  rejectionReason: PartRequestRejectionReason | null;
  rejectionDetail: string | null;
  processedById: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  part?: {
    id: string;
    name: string;
    referenceCode: string;
    currentStock: number;
    warehouseLocation: string | null;
  } | null;
  requester: {
    id: string;
    name: string;
  };
  workOrder: {
    id: string;
    referenceNumber: string;
    priority: string;
    status: string;
    asset: {
      id: string;
      name: string;
    } | null;
  };
}

export interface PartRequestQueueResponse {
  data: PartRequestQueueItem[];
  total: number;
}

export const partRequestsApi = {
  getQueue: (params?: {
    status?: PartRequestStatus;
    workOrderId?: string;
    page?: number;
    limit?: number;
  }) => api.get<PartRequestQueueResponse>('/part-requests', { params }).then((r) => r.data),

  fulfill: (id: string, payload?: { quantity?: number }) =>
    api.patch<PartRequestQueueItem>(`/part-requests/${id}/fulfill`, payload).then((r) => r.data),

  reject: (id: string, payload: { reason: PartRequestRejectionReason; detail?: string }) =>
    api.patch<PartRequestQueueItem>(`/part-requests/${id}/reject`, payload).then((r) => r.data),
};
