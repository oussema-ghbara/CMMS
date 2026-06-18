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
  DEAD_STOCK_THRESHOLD_DAYS: { min: 30, max: 730 },
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
    titleKey: 'admin.systemConfig.groups.inventoryThresholds',
    keys: ['DEAD_STOCK_THRESHOLD_DAYS'],
  },
  {
    titleKey: 'admin.systemConfig.groups.userThresholds',
    keys: ['INACTIVE_USER_THRESHOLD_DAYS'],
  },
];
