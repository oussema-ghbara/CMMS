import { api } from './api';
import {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
  WOCancellationReason,
  WOReassignmentReason,
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
  /** ISO-8601 — return only WOs closed at or after this date */
  closedAfter?: string;
  /** ISO-8601 — return only WOs closed at or before this date */
  closedBefore?: string;
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
  anomalyDescription: string | null;
  notApplicableReason: string | null;
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
  /** Actual DB field — use this for display */
  reasonType: string;
  /** Actual DB field — technician's detail note */
  detail: string | null;
  expectedResolutionDate: string | null;
  retryDate: string | null;
  supervisorAssetStatusChoice: string | null;
  supervisorResolutionNote: string | null;
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

export interface WorkOrderCostSummaryDetail {
  laborCost: number;
  partsCost: number;
  contractorCost: number;
  totalCost: number;
}

export interface WorkOrderCrossRef {
  id: string;
  referenceNumber: string;
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
  sourceReport: WorkOrderSourceReport | null;
  costSummary: WorkOrderCostSummaryDetail;
  /** Set when this WO was created as a follow-up to another (source = FOLLOW_UP). */
  followUpFrom: WorkOrderCrossRef | null;
  /** Follow-up WOs created from this WO after a COULD_NOT_INTERVENE validation. */
  followUps: WorkOrderCrossRef[];
}

export interface WorkOrderSourceReport {
  id: string;
  referenceNumber: string;
  description: string;
  urgencyPerception: string;
  reporter: { id: string; name: string };
  createdAt: string;
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
  forceCreate?: boolean;
  /** Pre-assign principal technician — triggers auto-publish + assign (spec §9.2) */
  principalTechnicianId?: string;
  /** Contributor IDs — only meaningful when principalTechnicianId is provided */
  contributorIds?: string[];
}

export interface DurationHintsResponse {
  /** Average closure days for last 5 closed WOs of same type on this asset */
  last5AssetAvgDays: number | null;
  /** Average closure days for last 50 closed WOs of same type in the asset's category */
  categoryAvgDays: number | null;
  /** Average closure days for the selected technician's last 10 closed WOs of same type */
  technicianAvgDays: number | null;
}

export interface DuplicateWoConflict {
  id: string;
  referenceNumber: string;
  status: WorkOrderStatus;
  type: WorkOrderType;
}

export interface AssignWorkOrderPayload {
  principalTechnicianId: string;
  contributorIds?: string[];
}

export interface ReassignTechnicianPayload {
  newTechnicianId: string;
  reason: WOReassignmentReason;
  reasonDetail?: string;
}

export interface PromoteTechnicianPayload {
  newPrincipalId: string;
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

/**
 * When the last intervention result is COULD_NOT_INTERVENE, `assetStatusOverride`
 * is mandatory — the supervisor must explicitly declare the post-validation asset
 * status because the asset was not actually repaired.
 * For all other intervention results the field is unused and may be omitted.
 */
export interface ValidateWorkOrderPayload {
  assetStatusOverride?: AssetStatus;
}

export interface UpdateHoldMetadataPayload {
  expectedResolutionDate?: string;
  retryDate?: string;
  resolutionNote?: string;
}

export interface CreateFollowUpPayload {
  type: WorkOrderType;
  priority: WorkOrderPriority;
  description: string;
  internalNotes?: string;
  estimatedDurationMinutes?: number;
  dueDate?: string;
}

// ── Technician load ───────────────────────────────────────────────────────────

export interface TechnicianLoadItem {
  technicianId: string;
  name: string;
  openWoCount: number;
  hasCritical: boolean;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface WorkOrderAnalyticsSummary {
  total: number;
  open: number;
  overdue: number;
  closedThisPeriod: number;
  cancelledThisPeriod: number;
  resolutionRate: number | null;
}

export interface WorkOrderAnalyticsResponse {
  periodDays: number;
  summary: WorkOrderAnalyticsSummary;
  byStatus: Partial<Record<WorkOrderStatus, number>>;
  byType: Partial<Record<WorkOrderType, number>>;
  byPriority: Partial<Record<WorkOrderPriority, number>>;
  avgResolutionDays: number | null;
  costSummary: WorkOrderCostSummaryDetail;
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

  reassign: (id: string, payload: ReassignTechnicianPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/reassign`, payload).then((r) => r.data),

  promote: (id: string, payload: PromoteTechnicianPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/promote`, payload).then((r) => r.data),

  validate: (id: string, payload?: ValidateWorkOrderPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/validate`, payload ?? {}).then((r) => r.data),

  reject: (id: string, payload: RejectValidationPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/reject`, payload).then((r) => r.data),

  cancel: (id: string, payload: CancelWorkOrderPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/cancel`, payload).then((r) => r.data),

  resolveBlock: (woId: string, blockId: string) =>
    api.patch<WorkOrderBlockFlag>(`/work-orders/${woId}/block/${blockId}/resolve`).then((r) => r.data),

  authorizeSimultaneous: (id: string) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/authorize-simultaneous`).then((r) => r.data),

  updateHoldMetadata: (id: string, payload: UpdateHoldMetadataPayload) =>
    api.patch<WorkOrderDetail>(`/work-orders/${id}/hold-metadata`, payload).then((r) => r.data),

  getAnalytics: (params?: { periodDays?: number }) =>
    api.get<WorkOrderAnalyticsResponse>('/work-orders/analytics', { params }).then((r) => r.data),

  createFollowUp: (originalWoId: string, payload: CreateFollowUpPayload) =>
    api.post<WorkOrderDetail>(`/work-orders/${originalWoId}/follow-up`, payload).then((r) => r.data),

  getTechnicianLoad: () =>
    api.get<TechnicianLoadItem[]>('/work-orders/technician-load').then((r) => r.data),

  getDurationHints: (params: { assetId: string; type: string; technicianId?: string }) =>
    api.get<DurationHintsResponse>('/work-orders/duration-hints', { params }).then((r) => r.data),
};
