export interface ConfigGroupDef {
  titleKey: string;
  descriptionKey?: string;
  keys: string[];
}

export const SYSTEM_CONFIG_BOOLEAN_KEYS = new Set([
  'PASSWORD_REQUIRE_UPPERCASE',
  'PASSWORD_REQUIRE_NUMBER',
  'PASSWORD_REQUIRE_SPECIAL',
]);

export const SYSTEM_CONFIG_KEY_CONSTRAINTS: Record<string, { min: number; max: number }> = {
  PASSWORD_MIN_LENGTH: { min: 6, max: 128 },
  SESSION_IDLE_TIMEOUT_HOURS: { min: 1, max: 72 },
  ESCALATION_CHECK_FREQUENCY_MINUTES: { min: 1, max: 1440 },
  DAILY_SUMMARY_HOUR: { min: 0, max: 23 },
  RECURRING_FAULT_THRESHOLD_COUNT: { min: 1, max: 100 },
  RECURRING_FAULT_THRESHOLD_DAYS: { min: 1, max: 365 },
  DEFERRED_REPORT_AGING_DAYS: { min: 1, max: 365 },
  POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS: { min: 1, max: 90 },
  DEAD_STOCK_THRESHOLD_DAYS: { min: 30, max: 730 },
  REORDER_SIGNAL_THRESHOLD_COUNT: { min: 1, max: 100 },
  INACTIVE_USER_THRESHOLD_DAYS: { min: 30, max: 730 },
};

export const SYSTEM_CONFIG_GROUPS: ConfigGroupDef[] = [
  {
    titleKey: 'admin.systemConfig.groups.passwordPolicy',
    descriptionKey: 'admin.systemConfig.groups.passwordPolicyDesc',
    keys: [
      'PASSWORD_MIN_LENGTH',
      'PASSWORD_REQUIRE_UPPERCASE',
      'PASSWORD_REQUIRE_NUMBER',
      'PASSWORD_REQUIRE_SPECIAL',
    ],
  },
  {
    titleKey: 'admin.systemConfig.groups.session',
    keys: ['SESSION_IDLE_TIMEOUT_HOURS'],
  },
  {
    titleKey: 'admin.systemConfig.groups.scheduling',
    keys: ['ESCALATION_CHECK_FREQUENCY_MINUTES', 'DAILY_SUMMARY_HOUR'],
  },
  {
    titleKey: 'admin.systemConfig.groups.workOrderThresholds',
    keys: [
      'RECURRING_FAULT_THRESHOLD_COUNT',
      'RECURRING_FAULT_THRESHOLD_DAYS',
      'DEFERRED_REPORT_AGING_DAYS',
      'POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS',
    ],
  },
  {
    titleKey: 'admin.systemConfig.groups.inventoryThresholds',
    keys: ['DEAD_STOCK_THRESHOLD_DAYS', 'REORDER_SIGNAL_THRESHOLD_COUNT'],
  },
  {
    titleKey: 'admin.systemConfig.groups.userThresholds',
    keys: ['INACTIVE_USER_THRESHOLD_DAYS'],
  },
];

export const ALL_KNOWN_KEYS = SYSTEM_CONFIG_GROUPS.flatMap((g) => g.keys);
