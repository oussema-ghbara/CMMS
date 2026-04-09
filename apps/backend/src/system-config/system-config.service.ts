import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Eagerly validate that required config keys exist at startup.
    // Fails fast rather than crashing silently at first use.
    const required = ['PASSWORD_MIN_LENGTH', 'PASSWORD_REQUIRE_UPPERCASE'];
    for (const key of required) {
      const row = await this.prisma.systemConfig.findUnique({ where: { key } });
      if (!row) {
        this.logger.error(
          `SystemConfig key "${key}" is missing — run the seed script: cd packages/db && npx prisma db seed`,
        );
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getOrThrow(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === null) {
      throw new Error(`SystemConfig key "${key}" not found. Run the seed script.`);
    }
    return value;
  }

  async set(key: string, value: string, actorId: string): Promise<void> {
    const existing = await this.prisma.systemConfig.findUnique({ where: { key } });
    const oldValue = existing?.value ?? null;

    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value, updatedById: actorId },
      create: { key, value, updatedById: actorId },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'CONFIG_UPDATED',
        targetType: 'SystemConfig',
        targetId: key,
        valueBefore: oldValue !== null ? { key, value: oldValue } : null,
        valueAfter: { key, value },
      },
    });

    this.logger.log(`SystemConfig updated: ${key} = ${value} by user ${actorId}`);
  }

  async getPasswordPolicy(): Promise<PasswordPolicy> {
    const [minLength, requireUppercase, requireNumber, requireSpecial] = await Promise.all([
      this.getOrThrow('PASSWORD_MIN_LENGTH'),
      this.getOrThrow('PASSWORD_REQUIRE_UPPERCASE'),
      this.getOrThrow('PASSWORD_REQUIRE_NUMBER'),
      this.getOrThrow('PASSWORD_REQUIRE_SPECIAL'),
    ]);

    return {
      minLength: parseInt(minLength, 10),
      requireUppercase: requireUppercase === 'true',
      requireNumber: requireNumber === 'true',
      requireSpecial: requireSpecial === 'true',
    };
  }

  /**
   * Validates a plaintext password against the current policy.
   * Returns null on success, or an i18n key describing the violation.
   */
  async validatePassword(password: string): Promise<string | null> {
    const policy = await this.getPasswordPolicy();

    if (password.length < policy.minLength) {
      return 'auth.passwordTooShort';
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      return 'auth.passwordRequiresUppercase';
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      return 'auth.passwordRequiresNumber';
    }
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
      return 'auth.passwordRequiresSpecial';
    }

    return null;
  }
}
