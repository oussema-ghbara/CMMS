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
  setAuth: (token: string, user: UserSession) => void;
  clearAuth: () => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  setAuth: (token, user) => set({ accessToken: token, user }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setInitialized: () => set({ isInitialized: true }),
}));
