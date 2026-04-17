import { AdminController } from './admin.controller';

describe('AdminController', () => {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    systemConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const systemConfig = {
    set: jest.fn(),
  };

  const adminAnalytics = {
    getUserActivityStats: jest.fn(),
    getSystemHealthStats: jest.fn(),
  };

  const controller = new AdminController(prisma as never, systemConfig as never, adminAnalytics as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
  });

  describe('getAuditLog()', () => {
    it('uses default pagination when query params are omitted', async () => {
      await controller.getAuditLog();

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
          where: {},
        }),
      );
      expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: {} });
    });

    it('clamps page and limit and applies filters', async () => {
      await controller.getAuditLog('0', '999', 'User', 'LOGIN');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 100,
          where: {
            targetType: 'User',
            actionType: 'LOGIN',
          },
        }),
      );
      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          targetType: 'User',
          actionType: 'LOGIN',
        },
      });
    });

    it('normalizes invalid numeric query values to safe defaults', async () => {
      const result = await controller.getAuditLog('not-a-number', 'not-a-number');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        }),
      );
      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });
    });

    it('propagates database errors consistently', async () => {
      prisma.auditLog.findMany.mockRejectedValueOnce(new Error('db exploded'));

      await expect(controller.getAuditLog('1', '20')).rejects.toThrow('db exploded');
      expect(prisma.auditLog.count).toHaveBeenCalledTimes(1);
    });
  });
});
