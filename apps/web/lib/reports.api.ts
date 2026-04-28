import { api } from './api';
import {
  ProblemReportStatus,
  ReportArchiveReason,
  ReportRejectionReason,
  UrgencyPerception,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@gmao/shared';

export interface ReportListUserRef {
  id: string;
  name: string;
}

export interface ReportListAssetRef {
  id: string;
  name: string;
  location: {
    fullPath: string;
  };
}

export interface ReportListItem {
  id: string;
  referenceNumber: string;
  assetId: string;
  reporterId: string;
  description: string;
  urgencyPerception: UrgencyPerception;
  status: ProblemReportStatus;
  processedById: string | null;
  processedAt: string | null;
  rejectionReason: ReportRejectionReason | null;
  rejectionDetail: string | null;
  deferredAt: string | null;
  deferNote: string | null;
  submittedDespiteWarning: boolean;
  archiveReason: ReportArchiveReason | null;
  replacedByWorkOrderRef: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: ReportListUserRef;
  asset: ReportListAssetRef;
}

export interface ReportCommentItem {
  id: string;
  reportId: string;
  authorId: string;
  content: string;
  acknowledgedBySupervisor: boolean;
  createdAt: string;
  author: ReportListUserRef;
}

export interface ReportLinkedWorkOrderItem {
  id: string;
  referenceNumber: string;
  status: WorkOrderStatus;
  createdAt: string;
}

/** §9.1: Active (non-terminal) WO on the same asset — used for duplicate detection banner. */
export interface ReportAssetActiveWO {
  id: string;
  referenceNumber: string;
  status: WorkOrderStatus;
  type: string;
  description: string | null;
  createdAt: string;
}

/** §9.1: Compliance certificate in an alert state (EXPIRING_SOON or EXPIRED). */
export interface ReportAssetCertAlert {
  id: string;
  certificateType: string;
  otherType: string | null;
  status: string;
  expirationDate: string;
  issuingAuthority: string;
}

/** §9.1: A recently closed WO on the asset, used in the intervention history sidebar. */
export interface ReportAssetInterventionHistoryItem {
  id: string;
  referenceNumber: string;
  type: string;
  closedAt: string | null;
  description: string | null;
  principalTechnician: { id: string; name: string } | null;
}

export interface ReportDetailItem extends ReportListItem {
  processedBy: ReportListUserRef | null;
  asset: ReportListAssetRef & {
    location: {
      id?: string;
      name?: string;
      code?: string | null;
      fullPath: string;
    };
    /** §9.1: Active (non-terminal) WOs for duplicate detection. */
    workOrders: ReportAssetActiveWO[];
    /** §9.1: Active compliance certificate alerts. */
    certificates: ReportAssetCertAlert[];
  };
  comments: ReportCommentItem[];
  derivedWorkOrders: ReportLinkedWorkOrderItem[];
  /** §9.1: Last 5 closed WOs for the asset, most recent first. */
  assetInterventionHistory: ReportAssetInterventionHistoryItem[];
}

export interface ReportListResponse {
  data: ReportListItem[];
  total: number;
}

export interface ReportListQuery {
  search?: string;
  status?: ProblemReportStatus;
  urgencyPerception?: UrgencyPerception;
  page?: number;
  limit?: number;
}

export interface ConvertReportPayload {
  priority?: WorkOrderPriority;
  description?: string;
  internalNotes?: string;
  estimatedDurationMinutes?: number;
  dueDate?: string;
}

export interface RejectReportPayload {
  reason: ReportRejectionReason;
  detail?: string;
}

export interface DeferReportPayload {
  note?: string;
}

export interface ArchiveReportPayload {
  archiveReason?: ReportArchiveReason;
}

export interface AddReportCommentPayload {
  content: string;
}

export const reportsApi = {
  list: (params?: ReportListQuery) =>
    api.get<ReportListResponse>('/reports', { params }).then((r) => r.data),

  getOne: (id: string) => api.get<ReportDetailItem>(`/reports/${id}`).then((r) => r.data),

  addComment: (id: string, payload: AddReportCommentPayload) =>
    api.post<ReportCommentItem>(`/reports/${id}/comments`, payload).then((r) => r.data),

  acknowledgeComment: (reportId: string, commentId: string) =>
    api.patch<ReportCommentItem>(`/reports/${reportId}/comments/${commentId}/acknowledge`).then((r) => r.data),

  convert: (id: string, payload: ConvertReportPayload) =>
    api.post(`/reports/${id}/convert`, payload).then((r) => r.data),

  reject: (id: string, payload: RejectReportPayload) =>
    api.patch<ReportDetailItem>(`/reports/${id}/reject`, payload).then((r) => r.data),

  defer: (id: string, payload: DeferReportPayload) =>
    api.patch<ReportDetailItem>(`/reports/${id}/defer`, payload).then((r) => r.data),

  reopen: (id: string) => api.patch<ReportDetailItem>(`/reports/${id}/reopen`).then((r) => r.data),

  archive: (id: string, payload: ArchiveReportPayload) =>
    api.patch<ReportDetailItem>(`/reports/${id}/archive`, payload).then((r) => r.data),
};