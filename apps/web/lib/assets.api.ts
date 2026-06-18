import { api } from './api';
import type { AssetCriticality, AssetStatus } from '@gmao/shared';

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
  documentId?: string | null;
  document?: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
  } | null;
}

export interface AssetDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
  } | null;
}

export interface AssetDetail extends AssetListItem {
  children: AssetParent[];
  certificates: AssetCertificate[];
  statusLogs: AssetStatusLogEntry[];
}

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

export interface CreateCertificatePayload {
  certificateType: string;
  otherType?: string;
  issuingAuthority: string;
  issueDate: string;
  expirationDate: string;
}

export type UpdateCertificatePayload = Partial<CreateCertificatePayload>;

export interface CertificateAlertItem {
  assetId: string;
  assetName: string;
  certificateType: string;
  otherType: string | null;
  expirationDate: string;
  status: 'EXPIRING_SOON' | 'EXPIRED';
}

export interface QrLookupResult {
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

export const assetsApi = {
  list: (params?: AssetListQuery) =>
    api.get<AssetListResponse>('/assets', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<AssetDetail>(`/assets/${id}`).then((r) => r.data),

  lookupByQrCode: (qrCode: string) =>
    api.get<QrLookupResult>(`/assets/qr/${encodeURIComponent(qrCode)}`).then((r) => r.data),

  create: (payload: CreateAssetPayload) =>
    api.post<AssetDetail>('/assets', payload).then((r) => r.data),

  update: (id: string, payload: UpdateAssetPayload) =>
    api.patch<AssetDetail>(`/assets/${id}`, payload).then((r) => r.data),

  transitionStatus: (id: string, payload: AssetStatusTransitionPayload) =>
    api.patch<AssetDetail>(`/assets/${id}/status`, payload).then((r) => r.data),

  listCertificates: (id: string) =>
    api.get<AssetCertificate[]>(`/assets/${id}/certificates`).then((r) => r.data),

  createCertificate: (id: string, payload: CreateCertificatePayload, file?: File) => {
    const form = new FormData();
    form.append('certificateType', payload.certificateType);
    if (payload.otherType) form.append('otherType', payload.otherType);
    form.append('issuingAuthority', payload.issuingAuthority);
    form.append('issueDate', payload.issueDate);
    form.append('expirationDate', payload.expirationDate);
    if (file) form.append('file', file);
    return api.post<AssetCertificate>(`/assets/${id}/certificates`, form).then((r) => r.data);
  },

  updateCertificate: (id: string, certId: string, payload: UpdateCertificatePayload, file?: File) => {
    const form = new FormData();
    if (payload.certificateType) form.append('certificateType', payload.certificateType);
    if (payload.otherType !== undefined) form.append('otherType', payload.otherType);
    if (payload.issuingAuthority) form.append('issuingAuthority', payload.issuingAuthority);
    if (payload.issueDate) form.append('issueDate', payload.issueDate);
    if (payload.expirationDate) form.append('expirationDate', payload.expirationDate);
    if (file) form.append('file', file);
    return api.patch<AssetCertificate>(`/assets/${id}/certificates/${certId}`, form).then((r) => r.data);
  },

  deleteCertificate: (id: string, certId: string) =>
    api.delete(`/assets/${id}/certificates/${certId}`),

  getCertificateDownloadUrl: (id: string, certId: string) =>
    api.get<string>(`/assets/${id}/certificates/${certId}/download`).then((r) => r.data),

  listDocuments: (id: string) =>
    api.get<AssetDocument[]>(`/assets/${id}/documents`).then((r) => r.data),

  uploadDocument: (id: string, file: File, documentType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', documentType);
    return api.post<AssetDocument>(`/assets/${id}/documents`, form).then((r) => r.data);
  },

  deleteDocument: (id: string, docId: string) =>
    api.delete(`/assets/${id}/documents/${docId}`),

  getDocumentDownloadUrl: (id: string, docId: string) =>
    api.get<string>(`/assets/${id}/documents/${docId}/download`).then((r) => r.data),

  getCertificateAlerts: () =>
    api.get<CertificateAlertItem[]>('/assets/certificates/alerts').then((r) => r.data),
};
