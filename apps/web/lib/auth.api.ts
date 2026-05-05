import { api } from './api';

export const authApi = {
  setup: (token: string, password: string) =>
    api.post('/auth/setup', { token, password }).then((r) => r.data),

  resendSetup: (email: string) =>
    api.post('/auth/resend-setup', { email }).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
};
