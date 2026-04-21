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

export interface UserRoleCount {
  role: string;
  count: number;
}

export interface LoginRecency {
  last7Days: number;
  last7To30Days: number;
  last30To90Days: number;
  over90Days: number;
  never: number;
}

export interface UserActivityStats {
  totalUsers: number;
  activeUsers: number;
  inactiveAccounts: number;
  neverLoggedIn: number;
  inactiveLast30Days: number;
  inactiveLast90Days: number;
  byRole: UserRoleCount[];
  loginRecency: LoginRecency;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
  delayed: number;
}

export interface NotificationStats {
  emailFailed: number;
  emailPendingDelivery: number;
  totalSentLast24h: number;
}

export interface ScheduledJobStat {
  jobName: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
}

export interface SystemHealthStats {
  queues: QueueStats[];
  notifications: NotificationStats;
  scheduledJobs: ScheduledJobStat[];
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

  getUserAnalytics: () =>
    api.get<UserActivityStats>('/admin/analytics/users').then((r) => r.data),

  getSystemHealth: () =>
    api.get<SystemHealthStats>('/admin/analytics/system').then((r) => r.data),
};
