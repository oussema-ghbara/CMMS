import { api } from './api';
import type { UserDto, CreateUserPayload, UpdateUserPayload } from '@gmao/shared';

export interface TechnicianOption {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export const usersApi = {
  list: (params?: { role?: string; isActive?: boolean }) =>
    api.get<UserDto[]>('/users', { params }).then((r) => r.data),

  listTechnicians: () =>
    api.get<TechnicianOption[]>('/users/technicians').then((r) => r.data),

  getOne: (id: string) => api.get<UserDto>(`/users/${id}`).then((r) => r.data),

  create: (payload: CreateUserPayload) =>
    api.post<UserDto>('/users', payload).then((r) => r.data),

  update: (id: string, payload: UpdateUserPayload) =>
    api.patch<UserDto>(`/users/${id}`, payload).then((r) => r.data),

  deactivate: (id: string) => api.post(`/users/${id}/deactivate`),

  reactivate: (id: string) => api.post(`/users/${id}/reactivate`),

  resendSetup: (id: string) => api.post(`/users/${id}/resend-setup`),

  getMe: () => api.get<UserDto>('/users/me').then((r) => r.data),

  getMyPreferences: () =>
    api.get<{ emailNotificationsEnabled: boolean }>('/users/me/preferences').then((r) => r.data),

  updateEmailNotifications: (enabled: boolean) =>
    api.patch<{ emailNotificationsEnabled: boolean }>('/users/me/email-notifications', { enabled }).then((r) => r.data),
};
