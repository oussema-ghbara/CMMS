import { api } from './api';
import { WorkOrderPriority, WorkOrderStatus, WorkOrderType } from '@gmao/shared';

export interface WorkOrderListAsset {
  id: string;
  name: string;
  status: string;
  location: {
    fullPath: string;
  } | null;
}

export interface WorkOrderListTechnician {
  id: string;
  name: string;
}

export interface WorkOrderListAssignment {
  id: string;
  technicianId: string;
  isPrincipal: boolean;
  technician: WorkOrderListTechnician;
}

export interface WorkOrderListItem {
  id: string;
  referenceNumber: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  description: string;
  estimatedDurationMinutes: number | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  asset: WorkOrderListAsset;
  principalTechnician: WorkOrderListTechnician | null;
  assignments: WorkOrderListAssignment[];
}

export interface WorkOrderListQuery {
  search?: string;
  status?: WorkOrderStatus;
  type?: WorkOrderType;
  priority?: WorkOrderPriority;
  page?: number;
  limit?: number;
}

export interface WorkOrderListResponse {
  data: WorkOrderListItem[];
  total: number;
}

export const workOrdersApi = {
  list: (params?: WorkOrderListQuery) =>
    api.get<WorkOrderListResponse>('/work-orders', { params }).then((r) => r.data),

  changePriority: (id: string, payload: { priority: WorkOrderPriority }) =>
    api.patch<WorkOrderListItem>(`/work-orders/${id}/priority`, payload).then((r) => r.data),
};
