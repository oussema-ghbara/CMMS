import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@gmao/db';
import { MAIL_QUEUE } from '../mail/mail.constants';
import { REPORT_GENERATION_QUEUE } from '../work-orders/jobs/report-generation.constants';
import { PREVENTIVE_PLAN_QUEUE } from '../preventive-plans/preventive-plans.constants';

export interface UserRoleCount {
  role: string;
  count: number;
}

export interface LoginRecency {
  last7Days: number;
  last7To30Days: number;
  last30To90Days: number;
  over90Days: number;
  never: number;
}

export interface UserActivityStats {
  totalUsers: number;
  activeUsers: number;
  inactiveAccounts: number;
  neverLoggedIn: number;
  inactiveLast30Days: number;
  inactiveLast90Days: number;
  byRole: UserRoleCount[];
  loginRecency: LoginRecency;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
  delayed: number;
}

export interface NotificationStats {
  emailFailed: number;
  emailPendingDelivery: number;
  totalSentLast24h: number;
}

export interface SystemHealthStats {
  queues: QueueStats[];
  notifications: NotificationStats;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
    @InjectQueue(REPORT_GENERATION_QUEUE) private readonly reportQueue: Queue,
    @InjectQueue(PREVENTIVE_PLAN_QUEUE) private readonly planQueue: Queue,
  ) {}

  async getUserActivityStats(): Promise<UserActivityStats> {
    const now = new Date();
    const ago7 = new Date(now.getTime() - 7 * MS_PER_DAY);
    const ago30 = new Date(now.getTime() - 30 * MS_PER_DAY);
    const ago90 = new Date(now.getTime() - 90 * MS_PER_DAY);

    const [
      totalUsers,
      activeUsers,
      inactiveAccounts,
      neverLoggedIn,
      inactiveLast30Days,
      inactiveLast90Days,
      loginLast7,
      login7to30,
      login30to90,
      loginOver90,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.user.count({ where: { isActive: true, lastLoginAt: null } }),
      this.prisma.user.count({
        where: { isActive: true, lastLoginAt: { not: null, lt: ago30 } },
      }),
      this.prisma.user.count({
        where: { isActive: true, lastLoginAt: { not: null, lt: ago90 } },
      }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago7 } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago30, lt: ago7 } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: ago90, lt: ago30 } } }),
      this.prisma.user.count({ where: { lastLoginAt: { not: null, lt: ago90 } } }),
    ]);

    const byRole = await Promise.all(
      Object.values(Role).map(async (role) => ({
        role,
        count: await this.prisma.user.count({ where: { roles: { has: role }, isActive: true } }),
      })),
    );

    return {
      totalUsers,
      activeUsers,
      inactiveAccounts,
      neverLoggedIn,
      inactiveLast30Days,
      inactiveLast90Days,
      byRole,
      loginRecency: {
        last7Days: loginLast7,
        last7To30Days: login7to30,
        last30To90Days: login30to90,
        over90Days: loginOver90,
        never: neverLoggedIn,
      },
    };
  }

  async getSystemHealthStats(): Promise<SystemHealthStats> {
    const ago24h = new Date(Date.now() - MS_PER_DAY);

    const [mailCounts, reportCounts, planCounts] = await Promise.all([
      this.mailQueue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed'),
      this.reportQueue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed'),
      this.planQueue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed'),
    ]);

    const [emailFailed, emailPendingDelivery, totalSentLast24h] =
      await this.prisma.$transaction([
        this.prisma.notification.count({ where: { emailFailed: true } }),
        this.prisma.notification.count({ where: { emailSent: false, emailFailed: false } }),
        this.prisma.notification.count({
          where: { emailSent: true, emailSentAt: { gte: ago24h } },
        }),
      ]);

    return {
      queues: [
        {
          name: MAIL_QUEUE,
          waiting: mailCounts.waiting ?? 0,
          active: mailCounts.active ?? 0,
          failed: mailCounts.failed ?? 0,
          completed: mailCounts.completed ?? 0,
          delayed: mailCounts.delayed ?? 0,
        },
        {
          name: REPORT_GENERATION_QUEUE,
          waiting: reportCounts.waiting ?? 0,
          active: reportCounts.active ?? 0,
          failed: reportCounts.failed ?? 0,
          completed: reportCounts.completed ?? 0,
          delayed: reportCounts.delayed ?? 0,
        },
        {
          name: PREVENTIVE_PLAN_QUEUE,
          waiting: planCounts.waiting ?? 0,
          active: planCounts.active ?? 0,
          failed: planCounts.failed ?? 0,
          completed: planCounts.completed ?? 0,
          delayed: planCounts.delayed ?? 0,
        },
      ],
      notifications: { emailFailed, emailPendingDelivery, totalSentLast24h },
    };
  }
}
