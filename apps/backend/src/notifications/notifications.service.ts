import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '@gmao/db';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  summary: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationListResult {
  data: Array<{
    id: string;
    type: NotificationType;
    title: string;
    summary: string;
    entityType: string | null;
    entityId: string | null;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Optional() private readonly gateway: NotificationsGateway | null = null,
  ) {}

  async notify(input: CreateNotificationInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.recipientId },
      select: { email: true, name: true, emailNotificationsEnabled: true, isActive: true },
    });

    if (!user || !user.isActive) return;

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        title: input.title,
        summary: input.summary,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    // Real-time push — deliver immediately to any open socket session for the recipient.
    // Uses @Optional() injection so the service remains usable in test contexts where
    // the gateway is not wired up.
    this.gateway?.emitToUser(input.recipientId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      summary: notification.summary,
      entityType: notification.entityType,
      entityId: notification.entityId,
      isRead: false,
      createdAt: notification.createdAt,
    });

    if (user.emailNotificationsEnabled) {
      await this.mail.enqueue({
        to: user.email,
        template: 'notification',
        context: {
          name: user.name,
          title: input.title,
          summary: input.summary,
        },
      });
    }
  }

  async notifyMany(inputs: CreateNotificationInput[]): Promise<void> {
    await Promise.all(inputs.map((i) => this.notify(i)));
  }

  async findForRecipient(recipientId: string, query: NotificationQueryDto): Promise<NotificationListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { recipientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          summary: true,
          entityType: true,
          entityId: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { recipientId } }),
      this.prisma.notification.count({ where: { recipientId, isRead: false } }),
    ]);

    return { data, total, page, limit, unreadCount };
  }

  async getUnreadCount(recipientId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId, isRead: false },
    });

    return { unreadCount };
  }

  async markAsRead(recipientId: string, notificationId: string): Promise<{ success: true }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientId },
      select: { id: true, isRead: true },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    if (!notification.isRead) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    return { success: true };
  }

  async markAllAsRead(recipientId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updated: count };
  }

  async notifySupervisors(
    type: NotificationType,
    title: string,
    summary: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    const supervisors = await this.prisma.user.findMany({
      where: { roles: { has: 'SUPERVISOR' }, isActive: true },
      select: { id: true },
    });
    await this.notifyMany(
      supervisors.map((s) => ({
        recipientId: s.id,
        type,
        title,
        summary,
        entityType,
        entityId,
      })),
    );
  }

  async notifyAdmins(
    type: NotificationType,
    title: string,
    summary: string,
    entityType?: string,
    entityId?: string,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { roles: { has: 'ADMIN' }, isActive: true },
      select: { id: true },
    });
    await this.notifyMany(
      admins.map((a) => ({
        recipientId: a.id,
        type,
        title,
        summary,
        entityType,
        entityId,
      })),
    );
  }
}
