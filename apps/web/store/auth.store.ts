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
  idleTimeoutHours: number | null;
  activeRole: Role | null;
  setAuth: (token: string, user: UserSession, idleTimeoutHours?: number) => void;
  clearAuth: () => void;
  setInitialized: () => void;
  setActiveRole: (role: Role) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  idleTimeoutHours: null,
  activeRole: null,
  setAuth: (token, user, idleTimeoutHours) =>
    set({
      accessToken: token,
      user,
      activeRole: user.roles[0] ?? null,
      ...(idleTimeoutHours != null && { idleTimeoutHours }),
    }),
  clearAuth: () => set({ accessToken: null, user: null, activeRole: null }),
  setInitialized: () => set({ isInitialized: true }),
  setActiveRole: (role) => set({ activeRole: role }),
}));
