import { api } from './api';

export interface SystemConfigEntry {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actor: { id: string; name: string; email: string };
  actionType: string;
  targetType: string;
  targetId: string;
  valueBefore: unknown;
  valueAfter: unknown;
  createdAt: string;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export const adminApi = {
  getSystemConfig: () =>
    api.get<SystemConfigEntry[]>('/admin/system-config').then((r) => r.data),

  updateSystemConfig: (key: string, value: string) =>
    api
      .patch<SystemConfigEntry>(`/admin/system-config/${key}`, { value })
      .then((r) => r.data),

  getAuditLog: (params?: { page?: number; limit?: number; targetType?: string; actionType?: string }) =>
    api.get<AuditLogResponse>('/admin/audit-log', { params }).then((r) => r.data),
};
