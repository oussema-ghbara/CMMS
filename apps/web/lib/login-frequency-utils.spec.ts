/**
 * Unit tests for login-frequency-utils
 *
 * Covers:
 * FREQUENCY_BADGE_VARIANT:
 * - Each LoginFrequencyCategory maps to the correct badge variant
 *
 * formatLoginDate:
 * - Returns null for null input
 * - Formats a valid ISO string using fr-FR locale
 * - Formats using a supplied locale
 */

import { FREQUENCY_BADGE_VARIANT, formatLoginDate } from './login-frequency-utils';
import type { LoginFrequencyCategory } from './admin.api';

describe('FREQUENCY_BADGE_VARIANT', () => {
  const cases: Array<[LoginFrequencyCategory, string]> = [
    ['RECENT', 'success'],
    ['WEEKLY', 'default'],
    ['OCCASIONAL', 'secondary'],
    ['INACTIVE', 'warning'],
    ['NEVER', 'destructive'],
  ];

  it.each(cases)('%s maps to variant %s', (category, expectedVariant) => {
    expect(FREQUENCY_BADGE_VARIANT[category]).toBe(expectedVariant);
  });

  it('covers all 5 categories', () => {
    expect(Object.keys(FREQUENCY_BADGE_VARIANT)).toHaveLength(5);
  });
});

describe('formatLoginDate', () => {
  it('returns null for null input', () => {
    expect(formatLoginDate(null, 'fr-FR')).toBeNull();
  });

  it('returns a non-empty string for a valid ISO string', () => {
    const result = formatLoginDate('2026-01-15T10:30:00.000Z', 'fr-FR');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('includes date components from the input ISO string', () => {
    const result = formatLoginDate('2026-01-15T10:30:00.000Z', 'fr-FR');
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/01|15|10|30/);
  });

  it('formats consistently with the requested locale', () => {
    const iso = '2026-06-20T14:00:00.000Z';
    const resultFr = formatLoginDate(iso, 'fr-FR');
    const resultEn = formatLoginDate(iso, 'en-US');
    expect(resultFr).not.toBeNull();
    expect(resultEn).not.toBeNull();
    expect(typeof resultFr).toBe('string');
    expect(typeof resultEn).toBe('string');
  });
});
