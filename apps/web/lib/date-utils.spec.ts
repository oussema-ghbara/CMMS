/**
 * Unit tests for date-utils — elapsedSince and todayStartIso.
 *
 * These utilities drive two features:
 *   - elapsedSince: renders "in queue since" in ValidationQueueBoard (§2.7)
 *   - todayStartIso: builds the closedAfter param for the dashboard "closed today"
 *     panel (§2.2)
 *
 * Failure scenario: if elapsedSince overflows into days prematurely (off-by-one in
 * the hour threshold), WOs that have been waiting for 23 hours would show "0j" instead
 * of "23h".
 *
 * Regression safety: todayStartIso must always produce a UTC midnight timestamp so that
 * the closedAfter filter is stable regardless of the server's local timezone.
 */

import { elapsedSince, todayStartIso } from './date-utils';

// ── elapsedSince ──────────────────────────────────────────────────────────────

describe('elapsedSince', () => {
  const HOUR_MS = 1000 * 60 * 60;
  const DAY_MS = 24 * HOUR_MS;

  it('returns "0h" for a date just now (< 1h)', () => {
    const nowIso = new Date().toISOString();
    expect(elapsedSince(nowIso)).toBe('0h');
  });

  it('returns hours for durations under 24 hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * HOUR_MS).toISOString();
    expect(elapsedSince(threeHoursAgo)).toBe('3h');
  });

  it('returns "23h" for exactly 23 hours ago (still within hour threshold)', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * HOUR_MS - 59 * 60 * 1000).toISOString();
    expect(elapsedSince(twentyThreeHoursAgo)).toBe('23h');
  });

  it('switches to days at exactly 24 hours', () => {
    const oneDayAgo = new Date(Date.now() - DAY_MS).toISOString();
    expect(elapsedSince(oneDayAgo)).toBe('1j');
  });

  it('returns "2j" for 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
    expect(elapsedSince(twoDaysAgo)).toBe('2j');
  });

  it('returns "7j" for 7 days ago', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
    expect(elapsedSince(sevenDaysAgo)).toBe('7j');
  });
});

// ── todayStartIso ──────────────────────────────────────────────────────────────

describe('todayStartIso', () => {
  it('returns an ISO-8601 string', () => {
    const result = todayStartIso();
    expect(() => new Date(result)).not.toThrow();
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it('always returns UTC midnight (time component is 00:00:00.000Z)', () => {
    const result = todayStartIso();
    const parsed = new Date(result);
    expect(parsed.getUTCHours()).toBe(0);
    expect(parsed.getUTCMinutes()).toBe(0);
    expect(parsed.getUTCSeconds()).toBe(0);
    expect(parsed.getUTCMilliseconds()).toBe(0);
  });

  it('returns today\'s date (not yesterday or tomorrow)', () => {
    const result = todayStartIso();
    const parsed = new Date(result);
    const now = new Date();
    expect(parsed.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(parsed.getUTCMonth()).toBe(now.getUTCMonth());
    expect(parsed.getUTCDate()).toBe(now.getUTCDate());
  });

  it('produces a date in the past (closed-today filter must include WOs closed earlier today)', () => {
    const result = todayStartIso();
    expect(new Date(result).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
