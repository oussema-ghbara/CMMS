import { api } from './api';
import type { AssetCriticality, AssetStatus } from '@gmao/shared';

// ── List types ────────────────────────────────────────────────────────────────

export interface AssetCategory {
  id: string;
  name: string;
}

export interface AssetLocation {
  id: string;
  name: string;
  fullPath: string;
}

export interface AssetParent {
  id: string;
  name: string;
}

export interface AssetListItem {
  id: string;
  name: string;
  description: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  installationDate: string | null;
  warrantyExpiration: string | null;
  qrCodeIdentifier: string;
  criticality: AssetCriticality;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  category: AssetCategory;
  location: AssetLocation;
  parent: AssetParent | null;
}

export interface AssetListResponse {
  data: AssetListItem[];
  total: number;
}

export interface AssetListQuery {
  search?: string;
  status?: AssetStatus;
  criticality?: AssetCriticality;
  categoryId?: string;
  locationId?: string;
  page?: number;
  limit?: number;
}

// ── Detail types ──────────────────────────────────────────────────────────────

export interface AssetStatusLogEntry {
  id: string;
  fromStatus: AssetStatus | null;
  toStatus: AssetStatus;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export interface AssetCertificate {
  id: string;
  certificateType: string;
  otherType: string | null;
  issuingAuthority: string;
  issueDate: string;
  expirationDate: string;
  status: string;
  createdAt: string;
}

export interface AssetDetail extends AssetListItem {
  children: AssetParent[];
  certificates: AssetCertificate[];
  statusLogs: AssetStatusLogEntry[];
}

// ── Payloads ──────────────────────────────────────────────────────────────────

export interface CreateAssetPayload {
  name: string;
  categoryId: string;
  locationId: string;
  criticality?: AssetCriticality;
  description?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  installationDate?: string;
  warrantyExpiration?: string;
  parentId?: string;
}

export type UpdateAssetPayload = Partial<CreateAssetPayload>;

export interface AssetStatusTransitionPayload {
  status: AssetStatus;
  reason?: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const assetsApi = {
  list: (params?: AssetListQuery) =>
    api.get<AssetListResponse>('/assets', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<AssetDetail>(`/assets/${id}`).then((r) => r.data),

  create: (payload: CreateAssetPayload) =>
    api.post<AssetDetail>('/assets', payload).then((r) => r.data),

  update: (id: string, payload: UpdateAssetPayload) =>
    api.patch<AssetDetail>(`/assets/${id}`, payload).then((r) => r.data),

  transitionStatus: (id: string, payload: AssetStatusTransitionPayload) =>
    api.patch<AssetDetail>(`/assets/${id}/status`, payload).then((r) => r.data),
};
