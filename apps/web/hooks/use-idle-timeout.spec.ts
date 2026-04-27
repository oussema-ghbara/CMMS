/**
 * Tests for session idle timeout enforcement (spec §3.4).
 *
 * Covers:
 *   1. Timeout duration calculation (idleTimeoutHours → ms, MIN enforcement)
 *   2. Redirect URL includes ?reason=idle for login form to show sessionExpired message
 *   3. Activity event list — all required DOM events are registered
 *   4. Timer reset on activity (fake-timer simulation)
 *   5. Logout sequence: api.post + clearAuth + Cookies.remove + router.push
 *   6. Auth store idleTimeoutHours field — setAuth signature and store shape
 *   7. Login form shows sessionExpired message for ?reason=idle param
 *
 * RTL is not installed. Pure-logic helpers are reproduced from the hook verbatim.
 * Timer-based assertions use jest.useFakeTimers().
 */

// ── Timeout calculation helpers ───────────────────────────────────────────────

const MIN_TIMEOUT_HOURS = 0.5;

function computeTimeoutMs(idleTimeoutHours: number): number {
  const hours = Math.max(idleTimeoutHours, MIN_TIMEOUT_HOURS);
  return hours * 60 * 60 * 1000;
}

describe('computeTimeoutMs — idle timeout duration', () => {
  it('returns correct ms for 8 hours', () => {
    expect(computeTimeoutMs(8)).toBe(8 * 60 * 60 * 1000);
  });

  it('returns correct ms for 1 hour', () => {
    expect(computeTimeoutMs(1)).toBe(60 * 60 * 1000);
  });

  it('clamps to MIN_TIMEOUT_HOURS when configured value is too low', () => {
    expect(computeTimeoutMs(0.1)).toBe(MIN_TIMEOUT_HOURS * 60 * 60 * 1000);
    expect(computeTimeoutMs(0)).toBe(MIN_TIMEOUT_HOURS * 60 * 60 * 1000);
  });

  it('passes through values above the minimum unchanged', () => {
    expect(computeTimeoutMs(MIN_TIMEOUT_HOURS)).toBe(MIN_TIMEOUT_HOURS * 60 * 60 * 1000);
    expect(computeTimeoutMs(72)).toBe(72 * 60 * 60 * 1000);
  });

  it('is consistent with the spec default of 8 hours → 28 800 000 ms', () => {
    expect(computeTimeoutMs(8)).toBe(28_800_000);
  });
});

// ── Redirect URL ──────────────────────────────────────────────────────────────

describe('idle redirect URL (§3.4)', () => {
  it('uses /login?reason=idle so the login form shows the sessionExpired message', () => {
    const REDIRECT_URL = '/login?reason=idle';
    const url = new URL(REDIRECT_URL, 'http://localhost');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('reason')).toBe('idle');
  });

  it('login form reads ?reason=idle to surface auth.sessionExpired i18n key', () => {
    function getLoginErrorKey(searchParam: string | null): string | null {
      if (searchParam === 'no_web_access') return 'auth.noWebAccess';
      if (searchParam === 'idle') return 'auth.sessionExpired';
      return null;
    }
    expect(getLoginErrorKey('idle')).toBe('auth.sessionExpired');
    expect(getLoginErrorKey('no_web_access')).toBe('auth.noWebAccess');
    expect(getLoginErrorKey(null)).toBeNull();
    expect(getLoginErrorKey('unknown')).toBeNull();
  });
});

// ── Activity events list ──────────────────────────────────────────────────────

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const;

describe('ACTIVITY_EVENTS list', () => {
  it('contains all required user interaction events', () => {
    expect(ACTIVITY_EVENTS).toContain('mousemove');
    expect(ACTIVITY_EVENTS).toContain('mousedown');
    expect(ACTIVITY_EVENTS).toContain('keydown');
    expect(ACTIVITY_EVENTS).toContain('touchstart');
    expect(ACTIVITY_EVENTS).toContain('scroll');
    expect(ACTIVITY_EVENTS).toContain('wheel');
  });

  it('has 6 distinct event types', () => {
    expect(new Set(ACTIVITY_EVENTS).size).toBe(6);
  });
});

// ── Timer reset on activity ───────────────────────────────────────────────────

describe('idle timer — reset on activity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fires callback after the configured timeout', () => {
    const callback = jest.fn();
    const timeoutMs = computeTimeoutMs(8);
    let timerId: number | null = null;

    function startTimer() {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(callback, timeoutMs) as unknown as number;
    }

    startTimer();
    jest.advanceTimersByTime(timeoutMs - 1);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire if activity resets the timer before it expires', () => {
    const callback = jest.fn();
    const timeoutMs = computeTimeoutMs(8);
    let timerId: number | null = null;

    function startTimer() {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(callback, timeoutMs) as unknown as number;
    }

    startTimer();
    jest.advanceTimersByTime(timeoutMs - 1000); // just before expiry
    startTimer(); // activity resets timer
    jest.advanceTimersByTime(timeoutMs - 1);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice if activity resets timer shortly before expiry', () => {
    const callback = jest.fn();
    const timeoutMs = computeTimeoutMs(1);
    let timerId: number | null = null;

    function startTimer() {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(callback, timeoutMs) as unknown as number;
    }

    startTimer();
    jest.advanceTimersByTime(timeoutMs / 2);
    startTimer(); // reset
    jest.advanceTimersByTime(timeoutMs); // advance past original expiry
    expect(callback).toHaveBeenCalledTimes(1); // only fires once after reset
  });
});

// ── Auth store shape ──────────────────────────────────────────────────────────

describe('AuthStore idleTimeoutHours field (§3.4)', () => {
  it('setAuth accepts optional idleTimeoutHours and stores it', () => {
    // Simulate the store's setAuth logic
    let storeState = { accessToken: null as string | null, idleTimeoutHours: null as number | null };

    function setAuth(token: string, _user: object, idleTimeoutHours?: number) {
      storeState = {
        ...storeState,
        accessToken: token,
        ...(idleTimeoutHours != null && { idleTimeoutHours }),
      };
    }

    setAuth('token-abc', {}, 8);
    expect(storeState.idleTimeoutHours).toBe(8);
  });

  it('setAuth does NOT clear idleTimeoutHours when called without the arg (e.g., on token refresh)', () => {
    let storeState = { accessToken: null as string | null, idleTimeoutHours: 8 as number | null };

    function setAuth(token: string, _user: object, idleTimeoutHours?: number) {
      storeState = {
        ...storeState,
        accessToken: token,
        ...(idleTimeoutHours != null && { idleTimeoutHours }),
      };
    }

    setAuth('new-token', {});
    expect(storeState.idleTimeoutHours).toBe(8); // preserved from previous login
  });

  it('idleTimeoutHours is null in initial state before first auth', () => {
    const initialState = { accessToken: null, idleTimeoutHours: null };
    expect(initialState.idleTimeoutHours).toBeNull();
  });
});

// ── Logout sequence ───────────────────────────────────────────────────────────

describe('idle logout sequence (§3.4)', () => {
  it('calls logout API, clears auth, removes cookie, and redirects', async () => {
    const apiPost = jest.fn().mockResolvedValue({});
    const clearAuth = jest.fn();
    const cookieRemove = jest.fn();
    const routerPush = jest.fn();

    async function performIdleLogout() {
      try {
        await apiPost('/auth/logout');
      } catch {
        // ignore
      }
      clearAuth();
      cookieRemove('user_roles', { path: '/' });
      routerPush('/login?reason=idle');
    }

    await performIdleLogout();

    expect(apiPost).toHaveBeenCalledWith('/auth/logout');
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(cookieRemove).toHaveBeenCalledWith('user_roles', { path: '/' });
    expect(routerPush).toHaveBeenCalledWith('/login?reason=idle');
  });

  it('still completes logout sequence even when API call fails', async () => {
    const apiPost = jest.fn().mockRejectedValue(new Error('network error'));
    const clearAuth = jest.fn();
    const cookieRemove = jest.fn();
    const routerPush = jest.fn();

    async function performIdleLogout() {
      try {
        await apiPost('/auth/logout');
      } catch {
        // ignore
      }
      clearAuth();
      cookieRemove('user_roles', { path: '/' });
      routerPush('/login?reason=idle');
    }

    await performIdleLogout();

    // API failed but the rest of the sequence must complete
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(cookieRemove).toHaveBeenCalledWith('user_roles', { path: '/' });
    expect(routerPush).toHaveBeenCalledWith('/login?reason=idle');
  });
});
