/**
 * Unit tests for NotificationsService.notifyAdmins() (§1.16)
 *
 * Covers:
 * - notifyAdmins: queries only ADMIN + isActive users
 * - notifyAdmins: calls notifyMany with the correct input shape
 * - notifyAdmins: no-op when no active admins exist
 * - notifyAdmins: entityType/entityId are optional and passed through
 */

import { NotificationsService } from './notifications.service';
import { NotificationType } from '@gmao/db';

function buildMocks() {
  const notifyMany = jest.fn().mockResolvedValue(undefined);
  // Partial NotificationsService — only override the methods under test.
  const service = Object.create(NotificationsService.prototype) as NotificationsService;
  (service as any).notifyMany = notifyMany;

  const prismaUserFindMany = jest.fn();
  (service as any).prisma = { user: { findMany: prismaUserFindMany } };

  return { service, notifyMany, prismaUserFindMany };
}

describe('NotificationsService.notifyAdmins()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries active ADMIN users and calls notifyMany with correct shape', async () => {
    const { service, notifyMany, prismaUserFindMany } = buildMocks();
    prismaUserFindMany.mockResolvedValueOnce([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    await service.notifyAdmins(
      NotificationType.SCHEDULED_JOB_FAILED,
      'Job failed',
      'The job crashed',
      'ScheduledJob',
      'my-job',
    );

    expect(prismaUserFindMany).toHaveBeenCalledWith({
      where: { roles: { has: 'ADMIN' }, isActive: true },
      select: { id: true },
    });

    expect(notifyMany).toHaveBeenCalledWith([
      {
        recipientId: 'admin-1',
        type: NotificationType.SCHEDULED_JOB_FAILED,
        title: 'Job failed',
        summary: 'The job crashed',
        entityType: 'ScheduledJob',
        entityId: 'my-job',
      },
      {
        recipientId: 'admin-2',
        type: NotificationType.SCHEDULED_JOB_FAILED,
        title: 'Job failed',
        summary: 'The job crashed',
        entityType: 'ScheduledJob',
        entityId: 'my-job',
      },
    ]);
  });

  it('calls notifyMany with empty array (no-op) when no active admins exist', async () => {
    const { service, notifyMany, prismaUserFindMany } = buildMocks();
    prismaUserFindMany.mockResolvedValueOnce([]);

    await service.notifyAdmins(
      NotificationType.NOTIFICATION_DELIVERY_FAILED,
      'Email failures',
      '5 emails failed',
    );

    expect(notifyMany).toHaveBeenCalledWith([]);
  });

  it('passes undefined entityType/entityId when omitted', async () => {
    const { service, notifyMany, prismaUserFindMany } = buildMocks();
    prismaUserFindMany.mockResolvedValueOnce([{ id: 'admin-1' }]);

    await service.notifyAdmins(
      NotificationType.NOTIFICATION_DELIVERY_FAILED,
      'Title',
      'Summary',
    );

    expect(notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ entityType: undefined, entityId: undefined }),
    ]);
  });
});
