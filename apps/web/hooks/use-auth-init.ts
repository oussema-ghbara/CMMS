'use client';

import { useEffect } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@gmao/shared';

interface RefreshResponse {
  accessToken: string;
  roles: Role[];
  userId: string;
  name: string;
}

/**
 * Called once in <Providers> on mount.
 * Attempts a silent token refresh using the httpOnly refresh_token cookie.
 * On success: hydrates the Zustand store and sets the user_roles cookie.
 * On failure: silently clears auth — middleware handles redirect.
 */
export function useAuthInit() {
  const { setAuth, clearAuth, setInitialized } = useAuthStore();

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

    axios
      .post<RefreshResponse>(`${baseUrl}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setAuth(data.accessToken, {
          id: data.userId,
          name: data.name,
          roles: data.roles,
        });
        Cookies.set('user_roles', JSON.stringify(data.roles), { path: '/', expires: 7 });
      })
      .catch(() => {
        clearAuth();
        Cookies.remove('user_roles', { path: '/' });
      })
      .finally(() => {
        setInitialized();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
