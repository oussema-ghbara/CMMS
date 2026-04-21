/**
 * Unit tests for JobLoggerService (§4.1)
 *
 * Covers:
 * - recordStart: upserts record with lastRunAt=now, create and update paths
 * - recordSuccess: upserts record with lastSuccessAt=now
 * - recordFailure: upserts record with lastFailureAt=now and truncated message
 * - recordFailure: truncates message longer than 500 chars
 * - All three methods swallow DB errors to prevent job interruption
 * - getAll: returns rows ordered by jobName asc
 */

import { JobLoggerService } from './job-logger.service';

function buildMocks() {
  const upsert = jest.fn().mockResolvedValue({});
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    scheduledJobLog: { upsert, findMany },
  };
  const service = new JobLoggerService(prisma as never);
  return { service, upsert, findMany };
}

describe('JobLoggerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('recordStart()', () => {
    it('upserts with lastRunAt=now for the given jobName', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordStart('test-job');
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        where: { jobName: string };
        create: { jobName: string; lastRunAt: Date };
        update: { lastRunAt: Date };
      };
      expect(call.where.jobName).toBe('test-job');
      expect(call.create.jobName).toBe('test-job');
      expect(call.create.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.create.lastRunAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.update.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastRunAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('DB connection lost'));
      await expect(service.recordStart('test-job')).resolves.toBeUndefined();
    });
  });

  describe('recordSuccess()', () => {
    it('upserts with lastSuccessAt=now', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordSuccess('test-job');
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        update: { lastSuccessAt: Date };
        create: { lastSuccessAt: Date };
      };
      expect(call.update.lastSuccessAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastSuccessAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.create.lastSuccessAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.recordSuccess('test-job')).resolves.toBeUndefined();
    });
  });

  describe('recordFailure()', () => {
    it('upserts with lastFailureAt=now and the error message', async () => {
      const { service, upsert } = buildMocks();
      const before = new Date();
      await service.recordFailure('test-job', new Error('something went wrong'));
      const after = new Date();

      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0] as {
        update: { lastFailureAt: Date; lastErrorMessage: string };
        create: { lastErrorMessage: string; lastFailureAt: Date };
      };
      expect(call.update.lastFailureAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.update.lastFailureAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(call.update.lastErrorMessage).toBe('something went wrong');
      expect(call.create.lastErrorMessage).toBe('something went wrong');
    });

    it('truncates error messages longer than 500 characters', async () => {
      const { service, upsert } = buildMocks();
      const longMessage = 'x'.repeat(600);
      await service.recordFailure('test-job', new Error(longMessage));

      const call = upsert.mock.calls[0][0] as {
        update: { lastErrorMessage: string };
      };
      expect(call.update.lastErrorMessage).toHaveLength(500);
    });

    it('swallows DB errors without throwing', async () => {
      const { service, upsert } = buildMocks();
      upsert.mockRejectedValueOnce(new Error('deadlock'));
      await expect(
        service.recordFailure('test-job', new Error('original error')),
      ).resolves.toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('returns all job logs ordered by jobName ascending', async () => {
      const { service, findMany } = buildMocks();
      const rows = [
        { jobName: 'access-retry-approaching', lastRunAt: null, lastSuccessAt: null, lastFailureAt: null, lastErrorMessage: null },
        { jobName: 'daily-summary', lastRunAt: new Date(), lastSuccessAt: new Date(), lastFailureAt: null, lastErrorMessage: null },
      ];
      findMany.mockResolvedValueOnce(rows);

      const result = await service.getAll();
      expect(result).toEqual(rows);
      expect(findMany).toHaveBeenCalledWith({ orderBy: { jobName: 'asc' } });
    });

    it('returns empty array when no logs exist', async () => {
      const { service } = buildMocks();
      const result = await service.getAll();
      expect(result).toEqual([]);
    });
  });
});
