/**
 * Unit tests for system-config-groups.
 *
 * These constants drive the §6.2 Admin System Config panel. The spec requires
 * all 10 operational keys to be rendered with labels, descriptions, and
 * appropriate input controls (not raw key names).
 *
 * Failure scenario: a newly-seeded key absent from SYSTEM_CONFIG_GROUPS would
 * fall through to the "Autres paramètres" card, showing its raw technical name
 * and a plain text input — exactly the bug we are fixing.
 *
 * Regression safety: the password-policy keys that were already handled remain
 * present and correctly marked as boolean or numeric, preserving existing admin
 * UX.
 */

import {
  SYSTEM_CONFIG_BOOLEAN_KEYS,
  SYSTEM_CONFIG_KEY_CONSTRAINTS,
  SYSTEM_CONFIG_GROUPS,
  ALL_KNOWN_KEYS,
} from './system-config-groups';

const ALL_OPERATIONAL_KEYS = [
  'SESSION_IDLE_TIMEOUT_HOURS',
  'ESCALATION_CHECK_FREQUENCY_MINUTES',
  'DAILY_SUMMARY_HOUR',
  'RECURRING_FAULT_THRESHOLD_COUNT',
  'RECURRING_FAULT_THRESHOLD_DAYS',
  'DEFERRED_REPORT_AGING_DAYS',
  'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS',
  'DEAD_STOCK_THRESHOLD_DAYS',
  'REORDER_SIGNAL_THRESHOLD_COUNT',
  'INACTIVE_USER_THRESHOLD_DAYS',
];

const ALL_PASSWORD_KEYS = [
  'PASSWORD_MIN_LENGTH',
  'PASSWORD_REQUIRE_UPPERCASE',
  'PASSWORD_REQUIRE_NUMBER',
  'PASSWORD_REQUIRE_SPECIAL',
];

describe('SYSTEM_CONFIG_GROUPS', () => {
  it('covers all 4 password-policy keys', () => {
    for (const key of ALL_PASSWORD_KEYS) {
      expect(ALL_KNOWN_KEYS).toContain(key);
    }
  });

  it('covers all 10 operational keys defined in §6.2', () => {
    for (const key of ALL_OPERATIONAL_KEYS) {
      expect(ALL_KNOWN_KEYS).toContain(key);
    }
  });

  it('contains exactly 14 known keys (4 password + 10 operational)', () => {
    expect(ALL_KNOWN_KEYS).toHaveLength(14);
  });

  it('has no duplicate keys across groups', () => {
    const seen = new Set<string>();
    for (const key of ALL_KNOWN_KEYS) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('each group has at least one key', () => {
    for (const group of SYSTEM_CONFIG_GROUPS) {
      expect(group.keys.length).toBeGreaterThan(0);
    }
  });

  it('each group has a non-empty titleKey', () => {
    for (const group of SYSTEM_CONFIG_GROUPS) {
      expect(typeof group.titleKey).toBe('string');
      expect(group.titleKey.trim()).not.toBe('');
    }
  });
});

describe('SYSTEM_CONFIG_BOOLEAN_KEYS', () => {
  it('marks the three boolean password keys', () => {
    expect(SYSTEM_CONFIG_BOOLEAN_KEYS.has('PASSWORD_REQUIRE_UPPERCASE')).toBe(true);
    expect(SYSTEM_CONFIG_BOOLEAN_KEYS.has('PASSWORD_REQUIRE_NUMBER')).toBe(true);
    expect(SYSTEM_CONFIG_BOOLEAN_KEYS.has('PASSWORD_REQUIRE_SPECIAL')).toBe(true);
  });

  it('does not mark PASSWORD_MIN_LENGTH as boolean', () => {
    expect(SYSTEM_CONFIG_BOOLEAN_KEYS.has('PASSWORD_MIN_LENGTH')).toBe(false);
  });

  it('does not mark any operational key as boolean', () => {
    for (const key of ALL_OPERATIONAL_KEYS) {
      expect(SYSTEM_CONFIG_BOOLEAN_KEYS.has(key)).toBe(false);
    }
  });
});

describe('SYSTEM_CONFIG_KEY_CONSTRAINTS', () => {
  it('provides constraints for all non-boolean keys', () => {
    const nonBooleanKeys = ALL_KNOWN_KEYS.filter((k) => !SYSTEM_CONFIG_BOOLEAN_KEYS.has(k));
    for (const key of nonBooleanKeys) {
      expect(SYSTEM_CONFIG_KEY_CONSTRAINTS[key]).toBeDefined();
    }
  });

  it('has no constraint entry for boolean keys (toggle controls need none)', () => {
    for (const key of SYSTEM_CONFIG_BOOLEAN_KEYS) {
      expect(SYSTEM_CONFIG_KEY_CONSTRAINTS[key]).toBeUndefined();
    }
  });

  it('all constraint ranges have min < max', () => {
    for (const [key, { min, max }] of Object.entries(SYSTEM_CONFIG_KEY_CONSTRAINTS)) {
      expect(min).toBeLessThan(max);
    }
  });

  it('DAILY_SUMMARY_HOUR allows 0 (midnight) as minimum', () => {
    expect(SYSTEM_CONFIG_KEY_CONSTRAINTS['DAILY_SUMMARY_HOUR'].min).toBe(0);
    expect(SYSTEM_CONFIG_KEY_CONSTRAINTS['DAILY_SUMMARY_HOUR'].max).toBe(23);
  });

  it('ESCALATION_CHECK_FREQUENCY_MINUTES allows up to 1440 (one full day)', () => {
    expect(SYSTEM_CONFIG_KEY_CONSTRAINTS['ESCALATION_CHECK_FREQUENCY_MINUTES'].max).toBe(1440);
  });
});
