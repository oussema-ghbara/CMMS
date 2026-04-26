import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import Cookies from 'js-cookie';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

// ─── Token refresh state ──────────────────────────────────────────────────────
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!),
  );
  refreshQueue = [];
}

// ─── Request interceptor: attach Bearer token ─────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: silent token refresh on 401 ───────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't retry the refresh endpoint itself
    if (originalRequest.url?.includes('/auth/refresh')) {
      useAuthStore.getState().clearAuth();
      Cookies.remove('user_roles', { path: '/' });
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        originalRequest._retry = true;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post<{
        accessToken: string;
        roles: string[];
        userId: string;
        name: string;
        idleTimeoutHours: number;
      }>(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {}, { withCredentials: true });

      const { accessToken, roles, userId, name, idleTimeoutHours } = data;
      useAuthStore.getState().setAuth(accessToken, { id: userId, name, roles: roles as never }, idleTimeoutHours);
      Cookies.set('user_roles', JSON.stringify(roles), { path: '/', expires: 7 });

      flushQueue(null, accessToken);
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      useAuthStore.getState().clearAuth();
      Cookies.remove('user_roles', { path: '/' });
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
