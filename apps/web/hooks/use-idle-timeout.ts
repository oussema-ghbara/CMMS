'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const;

const MIN_TIMEOUT_HOURS = 0.5;

export function useIdleTimeout(): void {
  const router = useRouter();
  const idleTimeoutHours = useAuthStore((state) => state.idleTimeoutHours);
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doLogout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {

    }
    clearAuth();
    Cookies.remove('user_roles', { path: '/' });
    router.push('/login?reason=idle');
  }, [clearAuth, router]);

  const resetTimer = useCallback(
    (timeoutMs: number) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void doLogout();
      }, timeoutMs);
    },
    [doLogout],
  );

  useEffect(() => {

    if (!accessToken || !idleTimeoutHours) return;

    const hours = Math.max(idleTimeoutHours, MIN_TIMEOUT_HOURS);
    const timeoutMs = hours * 60 * 60 * 1000;

    resetTimer(timeoutMs);

    const handleActivity = () => resetTimer(timeoutMs);

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [accessToken, idleTimeoutHours, resetTimer]);
}
