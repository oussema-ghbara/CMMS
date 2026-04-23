import { api } from './api';
import type { AssetStatus } from '@gmao/shared';

export type PreventiveFrequencyType = 'FIXED_INTERVAL_DAYS' | 'CALENDAR';
export type ChecklistTaskType =
  | 'INSPECTION'
  | 'MEASUREMENT'
  | 'LUBRICATION'
  | 'CLEANING'
  | 'REPLACEMENT'
  | 'CALIBRATION'
  | 'ADJUSTMENT';

export interface PreventivePlanAssetRef {
  id: string;
  name: string;
  status: AssetStatus;
  qrCodeIdentifier: string;
  location?: {
    id?: string;
    name?: string;
    fullPath: string;
  };
}

export interface PreventivePlanTechnicianRef {
  id: string;
  name: string;
  email: string;
}

export interface PreventivePlanChecklistItem {
  id: string;
  planId: string;
  description: string;
  taskType: ChecklistTaskType;
  expectedCondition: string | null;
  isMandatory: boolean;
  sortOrder: number;
  autoCreateCorrectiveWO: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreventivePlanItem {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  frequencyType: PreventiveFrequencyType;
  intervalDays: number | null;
  calendarExpression: string | null;
  estimatedDurationMinutes: number | null;
  defaultTechnicianId: string | null;
  isActive: boolean;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  asset: PreventivePlanAssetRef;
  defaultTechnician: PreventivePlanTechnicianRef | null;
  checklistItems: PreventivePlanChecklistItem[];
}

export interface PreventivePlanListResponse {
  data: PreventivePlanItem[];
  total: number;
}

export interface PreventivePlanQuery {
  assetId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreatePreventivePlanPayload {
  assetId: string;
  title: string;
  description?: string;
  frequencyType: PreventiveFrequencyType;
  intervalDays?: number;
  calendarExpression?: string;
  estimatedDurationMinutes?: number;
  defaultTechnicianId?: string;
  firstDueAt?: string;
}

export type UpdatePreventivePlanPayload = Partial<Omit<CreatePreventivePlanPayload, 'assetId' | 'firstDueAt'>>;

export interface CreateChecklistItemPayload {
  description: string;
  taskType: ChecklistTaskType;
  expectedCondition?: string;
  isMandatory?: boolean;
  sortOrder?: number;
  autoCreateCorrectiveWO?: boolean;
}

export type UpdateChecklistItemPayload = Partial<CreateChecklistItemPayload>;

export const preventivePlansApi = {
  list: (params?: PreventivePlanQuery) =>
    api.get<PreventivePlanListResponse>('/preventive-plans', { params }).then((response) => response.data),

  create: (payload: CreatePreventivePlanPayload) =>
    api.post<PreventivePlanItem>('/preventive-plans', payload).then((response) => response.data),

  update: (id: string, payload: UpdatePreventivePlanPayload) =>
    api.patch<PreventivePlanItem>(`/preventive-plans/${id}`, payload).then((response) => response.data),

  activate: (id: string) =>
    api.patch<PreventivePlanItem>(`/preventive-plans/${id}/activate`).then((response) => response.data),

  deactivate: (id: string) =>
    api.patch<PreventivePlanItem>(`/preventive-plans/${id}/deactivate`).then((response) => response.data),

  triggerNow: (id: string) =>
    api.post<{ jobId?: string }>(`/preventive-plans/${id}/trigger`).then((response) => response.data),

  addChecklistItem: (id: string, payload: CreateChecklistItemPayload) =>
    api.post<PreventivePlanChecklistItem>(`/preventive-plans/${id}/checklist-items`, payload).then((response) => response.data),

  updateChecklistItem: (planId: string, itemId: string, payload: UpdateChecklistItemPayload) =>
    api.patch<PreventivePlanChecklistItem>(`/preventive-plans/${planId}/checklist-items/${itemId}`, payload).then((response) => response.data),

  deleteChecklistItem: (planId: string, itemId: string) =>
    api.delete<void>(`/preventive-plans/${planId}/checklist-items/${itemId}`).then((response) => response.data),

  reorderChecklistItems: (planId: string, items: { id: string; sortOrder: number }[]) =>
    api.post<void>(`/preventive-plans/${planId}/checklist-items/reorder`, { items }).then((response) => response.data),

  listPlanDocuments: (planId: string) =>
    api.get<PlanDocument[]>(`/preventive-plans/${planId}/documents`).then((r) => r.data),

  uploadPlanDocument: (planId: string, file: File, documentType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return api.post<PlanDocument>(`/preventive-plans/${planId}/documents`, form).then((r) => r.data);
  },

  getPlanDocumentDownloadUrl: (planId: string, docId: string) =>
    api.get<string>(`/preventive-plans/${planId}/documents/${docId}/download`).then((r) => r.data),

  getPlanDocumentVersionHistory: (planId: string, docId: string) =>
    api.get<PlanDocument[]>(`/preventive-plans/${planId}/documents/${docId}/versions`).then((r) => r.data),

  deletePlanDocument: (planId: string, docId: string) =>
    api.delete(`/preventive-plans/${planId}/documents/${docId}`),
};

export interface PlanDocument {
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