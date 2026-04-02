import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '@gmao/db';

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  summary: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async notify(input: CreateNotificationInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.recipientId },
      select: { email: true, name: true, emailNotificationsEnabled: true, isActive: true },
    });

    if (!user || !user.isActive) return;

    await this.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        title: input.title,
        summary: input.summary,
        entityType: input.entityType,
        entityId: input.entityId,
      },
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
}
