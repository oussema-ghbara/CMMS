import { api } from './api';
import {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
  WOCancellationReason,
  ValidationRejectionReason,
  AssetStatus,
} from '@gmao/shared';

// ── List types ────────────────────────────────────────────────────────────────

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

// ── Detail types ──────────────────────────────────────────────────────────────

export interface WorkOrderStatusLogEntry {
  id: string;
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus;
  label: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export interface WorkOrderChecklistItem {
  id: string;
  description: string;
  taskType: string;
  isMandatory: boolean;
  status: string;
  sortOrder: number;
  expectedCondition: string | null;
  completedAt: string | null;
  completedNote: string | null;
}

export interface WorkOrderBlockFlag {
  id: string;
  reason: string;
  isResolved: boolean;
  createdAt: string;
}

export interface WorkOrderAssignmentDetail {
  id: string;
  technicianId: string;
  isPrincipal: boolean;
  isActive: boolean;
  technician: { id: string; name: string };
  blockFlags: WorkOrderBlockFlag[];
}

export interface WorkOrderInterventionAction {
  id: string;
  actionType: string;
  description: string | null;
}

export interface WorkOrderInterventionLog {
  id: string;
  technicianId: string;
  technician: { id: string; name: string };
  startedAt: string;
  endedAt: string | null;
  activeDurationMinutes: number | null;
  result: string | null;
  resultExplanation: string | null;
  hourlyRateAtTime: number | null;
  actions: WorkOrderInterventionAction[];
}

export interface WorkOrderValidationAction {
  id: string;
  action: string;
  rejectionReason: string | null;
  rejectionDetail: string | null;
  createdAt: string;
}

export interface WorkOrderOnHoldPeriod {
  id: string;
  reason: string;
  note: string | null;
  startedAt: string;
  resumedAt: string | null;
}

export interface WorkOrderPartRequest {
  id: string;
  status: string;
  quantityRequested: number;
  quantityFulfilled: number | null;
  part: { id: string; name: string; referenceCode: string } | null;
}

export interface WorkOrderDetailAsset {
  id: string;
  name: string;
  status: string;
  qrCodeIdentifier: string;
  location: { id: string; name: string; fullPath: string };
  category: { id: string; name: string };
}

export interface WorkOrderDetail {
  id: string;
  referenceNumber: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  description: string;
  internalNotes: string | null;
  estimatedDurationMinutes: number | null;
  dueDate: string | null;
  capturedLocationPath: string;
  sourceType: string;
  simultaneousMaintenanceAuthorized: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationDetail: string | null;
  asset: WorkOrderDetailAsset;
  principalTechnician: { id: string; name: string } | null;
  assignments: WorkOrderAssignmentDetail[];
  checklistItems: WorkOrderChecklistItem[];
  statusLogs: WorkOrderStatusLogEntry[];
  interventionLogs: WorkOrderInterventionLog[];
  validationActions: WorkOrderValidationAction[];
  onHoldPeriods: WorkOrderOnHoldPeriod[];
  partRequests: WorkOrderPartRequest[];
}

// ── Payloads ──────────────────────────────────────────────────────────────────

export interface CreateWorkOrderPayload {
  type: WorkOrderType;
  priority: WorkOrderPriority;
  description: string;
  assetId: string;
  internalNotes?: string;
  dueDate?: string;
  estimatedDurationMinutes?: number;
}

export interface AssignWorkOrderPayload {
  principalTechnicianId: string;
  contributorIds?: string[];
}

export interface CancelWorkOrderPayload {
  reason: WOCancellationReason;
  detail?: string;
  postCancellationAssetStatus?: AssetStatus;
}

export interface RejectValidationPayload {
  rejectionReason: ValidationRejectionReason;
  rejectionDetail?: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const workOrdersApi = {
  list: (params?: WorkOrderListQuery) =>
    api.get<WorkOrderListResponse>('/work-orders', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<WorkOrderDetail>(`/work-orders/${id}`).then((r) => r.data),

  create: (payload: CreateWorkOrderPayload) =>
    api.post<WorkOrderDetail>('/work-orders', payload).then((r) => r.data),

  changePriority: (id: string, payload: { priority: WorkOrderPriority }) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/priority`, payload).then((r) => r.data),

  publish: (id: string) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/publish`).then((r) => r.data),

  assign: (id: string, payload: AssignWorkOrderPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/assign`, payload).then((r) => r.data),

  validate: (id: string) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/validate`).then((r) => r.data),

  reject: (id: string, payload: RejectValidationPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/reject`, payload).then((r) => r.data),

  cancel: (id: string, payload: CancelWorkOrderPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/cancel`, payload).then((r) => r.data),
};
