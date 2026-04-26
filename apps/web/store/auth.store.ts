import { create } from 'zustand';
import type { Role } from '@gmao/shared';

export interface UserSession {
  id: string;
  name: string;
  roles: Role[];
}

interface AuthState {
  accessToken: string | null;
  user: UserSession | null;
  isInitialized: boolean;
  /** Session idle timeout in hours returned by the server (§3.4). Null until first auth. */
  idleTimeoutHours: number | null;
  setAuth: (token: string, user: UserSession, idleTimeoutHours?: number) => void;
  clearAuth: () => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  idleTimeoutHours: null,
  setAuth: (token, user, idleTimeoutHours) =>
    set({ accessToken: token, user, ...(idleTimeoutHours != null && { idleTimeoutHours }) }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setInitialized: () => set({ isInitialized: true }),
}));
