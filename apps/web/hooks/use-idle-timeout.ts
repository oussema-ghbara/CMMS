'use client';

/**
 * Implements §3.4 — SESSION_IDLE_TIMEOUT_HOURS enforcement.
 *
 * Tracks user activity (mouse, keyboard, touch, scroll). If no activity is
 * detected for the configured number of hours, calls POST /auth/logout and
 * redirects to /login.
 *
 * The idle timer is reset on every activity event. Mounting this hook inside
 * AppShell (protected routes only) ensures it is inactive on public pages.
 */

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

/** Minimum sensible timeout enforced client-side to avoid mis-configuration. */
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
      // Ignore — session may already be expired
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
    // Only active when the user is authenticated and the timeout is known.
    if (!accessToken || !idleTimeoutHours) return;

    const hours = Math.max(idleTimeoutHours, MIN_TIMEOUT_HOURS);
    const timeoutMs = hours * 60 * 60 * 1000;

    // Start the initial timer.
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
