/**
 * Unit tests for NotificationsGateway
 *
 * Covers:
 * - handleConnection: no token → disconnect immediately
 * - handleConnection: invalid/expired token → disconnect
 * - handleConnection: valid token → join user:<sub> room
 * - handleDisconnect: log without error
 * - emitToUser: delegates to server.to().emit()
 */

import { NotificationsGateway } from './notifications.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// ── Minimal Socket mock ───────────────────────────────────────────────────────

function buildSocket(authToken?: string) {
  return {
    id: 'socket-abc',
    handshake: {
      auth: authToken !== undefined ? { token: authToken } : {},
    },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as import('socket.io').Socket;
}

// ── Factory ───────────────────────────────────────────────────────────────────

function buildGateway(jwtVerifyResult: 'valid' | 'invalid') {
  const jwtService = {
    verifyAsync: jest.fn(
      jwtVerifyResult === 'valid'
        ? () => Promise.resolve({ sub: 'user-1' })
        : () => Promise.reject(new Error('invalid token')),
    ),
  } as unknown as JwtService;

  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
  } as unknown as ConfigService;

  const gateway = new NotificationsGateway(jwtService, config);

  // Inject a fake server object
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  const fakeServer = { to: toFn } as unknown as import('socket.io').Server;
  // Access private field for testing
  (gateway as unknown as { server: typeof fakeServer }).server = fakeServer;

  return { gateway, jwtService, config, toFn, emitFn };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationsGateway', () => {
  describe('handleConnection', () => {
    it('disconnects immediately when auth token is absent', async () => {
      const { gateway } = buildGateway('valid');
      const client = buildSocket(undefined);

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when token is an empty string', async () => {
      const { gateway } = buildGateway('valid');
      const client = buildSocket('');

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when JwtService.verifyAsync throws', async () => {
      const { gateway } = buildGateway('invalid');
      const client = buildSocket('bad-token');

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the user room and stores userId on client.data when token is valid', async () => {
      const { gateway } = buildGateway('valid');
      const client = buildSocket('valid-token');

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client.data as Record<string, unknown>).userId).toBe('user-1');
    });

    it('passes JWT_ACCESS_SECRET from ConfigService to verifyAsync', async () => {
      const { gateway, jwtService, config } = buildGateway('valid');
      const client = buildSocket('some-token');

      await gateway.handleConnection(client);

      expect(config.getOrThrow).toHaveBeenCalledWith('JWT_ACCESS_SECRET');
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('some-token', {
        secret: 'test-secret',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('does not throw when client has no userId stored', () => {
      const { gateway } = buildGateway('valid');
      const client = buildSocket();
      // data is empty — should be handled gracefully
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });

    it('does not throw when client has userId stored', () => {
      const { gateway } = buildGateway('valid');
      const client = buildSocket();
      (client.data as Record<string, unknown>).userId = 'user-42';
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  describe('emitToUser', () => {
    it('emits the event to the user:<userId> room', () => {
      const { gateway, toFn, emitFn } = buildGateway('valid');
      const payload = { id: 'notif-1', title: 'Test' };

      gateway.emitToUser('user-5', 'notification', payload);

      expect(toFn).toHaveBeenCalledWith('user:user-5');
      expect(emitFn).toHaveBeenCalledWith('notification', payload);
    });

    it('emits with any event name, not just "notification"', () => {
      const { gateway, toFn, emitFn } = buildGateway('valid');

      gateway.emitToUser('user-9', 'custom_event', { data: 42 });

      expect(toFn).toHaveBeenCalledWith('user:user-9');
      expect(emitFn).toHaveBeenCalledWith('custom_event', { data: 42 });
    });

    it('does not throw when server is not yet initialised', () => {
      const { gateway } = buildGateway('valid');
      // Remove the injected server to simulate pre-init state
      (gateway as unknown as { server: null }).server = null;

      expect(() =>
        gateway.emitToUser('user-1', 'notification', {}),
      ).not.toThrow();
    });
  });
});

// ── NotificationsService socket emission ──────────────────────────────────────

/**
 * These tests verify the integration point between NotificationsService and
 * NotificationsGateway: after a DB notification is persisted, the service
 * must call gateway.emitToUser with the correct payload.
 */

import { NotificationsService } from './notifications.service';
import { NotificationType } from '@gmao/db';

function buildServiceMocks() {
  const notification = {
    id: 'notif-id',
    type: NotificationType.WO_ASSIGNED,
    title: 'Assigned',
    summary: 'You have been assigned to WO-001',
    entityType: 'WorkOrder',
    entityId: 'wo-1',
    isRead: false,
    createdAt: new Date('2026-04-18T10:00:00Z'),
  };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        email: 'tech@example.com',
        name: 'Tech',
        emailNotificationsEnabled: false,
        isActive: true,
      }),
    },
    notification: {
      create: jest.fn().mockResolvedValue(notification),
    },
  };

  const mail = { enqueue: jest.fn().mockResolvedValue(undefined) };

  const gateway = {
    emitToUser: jest.fn(),
  } as unknown as NotificationsGateway;

  return { prisma, mail, gateway, notification };
}

describe('NotificationsService.notify — socket emission', () => {
  it('calls gateway.emitToUser with the persisted notification payload', async () => {
    const { prisma, mail, gateway, notification } = buildServiceMocks();
    const service = new NotificationsService(prisma as never, mail as never, gateway);

    await service.notify({
      recipientId: 'user-1',
      type: NotificationType.WO_ASSIGNED,
      title: 'Assigned',
      summary: 'You have been assigned to WO-001',
      entityType: 'WorkOrder',
      entityId: 'wo-1',
    });

    expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      summary: notification.summary,
      entityType: notification.entityType,
      entityId: notification.entityId,
      isRead: false,
      createdAt: notification.createdAt,
    });
  });

  it('does NOT emit when the recipient is inactive', async () => {
    const { prisma, mail, gateway } = buildServiceMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...{ email: 'x@x.com', name: 'X', emailNotificationsEnabled: false },
      isActive: false,
    });
    const service = new NotificationsService(prisma as never, mail as never, gateway);

    await service.notify({
      recipientId: 'inactive-user',
      type: NotificationType.WO_ASSIGNED,
      title: 'T',
      summary: 'S',
    });

    expect(gateway.emitToUser).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does NOT emit when the recipient does not exist', async () => {
    const { prisma, mail, gateway } = buildServiceMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new NotificationsService(prisma as never, mail as never, gateway);

    await service.notify({
      recipientId: 'ghost-user',
      type: NotificationType.WO_ASSIGNED,
      title: 'T',
      summary: 'S',
    });

    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('works without a gateway (gateway is null — @Optional injection)', async () => {
    const { prisma, mail } = buildServiceMocks();
    // Pass null explicitly — simulates @Optional() returning nothing
    const service = new NotificationsService(prisma as never, mail as never, null);

    await expect(
      service.notify({
        recipientId: 'user-1',
        type: NotificationType.WO_ASSIGNED,
        title: 'T',
        summary: 'S',
      }),
    ).resolves.not.toThrow();
  });
});
