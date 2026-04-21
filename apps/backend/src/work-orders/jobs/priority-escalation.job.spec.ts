/**
 * Unit tests for PriorityEscalationJob (§4.1)
 *
 * Covers:
 * - Schedule decorator registers run() with EVERY_HOUR cron expression
 * - Successful escalation: delegates to WorkOrdersService.autoEscalateOverduePriorities
 * - jobLogger.recordStart called before escalation
 * - jobLogger.recordSuccess called on success
 * - jobLogger.recordFailure called and error re-thrown on failure
 */

import { CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { PriorityEscalationJob } from './priority-escalation.job';

function buildMocks() {
  const autoEscalate = jest.fn().mockResolvedValue({ checked: 10, escalated: 2 });

  const workOrders = {
    autoEscalateOverduePriorities: autoEscalate,
  };

  const jobLogger = {
    recordStart: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  };

  const job = new PriorityEscalationJob(workOrders as never, jobLogger as never);

  return { job, workOrders, autoEscalate, jobLogger };
}

describe('PriorityEscalationJob', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule decorator', () => {
    it('registers run() with an EVERY_HOUR cron expression', () => {
      const cronOptions = Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        PriorityEscalationJob.prototype.run,
      ) as { cronTime?: string } | undefined;

      expect(cronOptions).toBeDefined();
      expect(cronOptions?.cronTime).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('run()', () => {
    it('calls autoEscalateOverduePriorities', async () => {
      const { job, autoEscalate } = buildMocks();
      await job.run();
      expect(autoEscalate).toHaveBeenCalledTimes(1);
    });

    it('propagates escalation service errors', async () => {
      const { job, autoEscalate } = buildMocks();
      autoEscalate.mockRejectedValueOnce(new Error('DB timeout'));

      await expect(job.run()).rejects.toThrow('DB timeout');
    });
  });

  describe('job lifecycle logging (§4.1)', () => {
    it('calls recordStart with "priority-escalation"', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordStart).toHaveBeenCalledWith('priority-escalation');
    });

    it('calls recordSuccess on successful execution', async () => {
      const { job, jobLogger } = buildMocks();
      await job.run();
      expect(jobLogger.recordSuccess).toHaveBeenCalledWith('priority-escalation');
      expect(jobLogger.recordFailure).not.toHaveBeenCalled();
    });

    it('calls recordFailure and re-throws on error', async () => {
      const { job, autoEscalate, jobLogger } = buildMocks();
      const err = new Error('escalation failed');
      autoEscalate.mockRejectedValueOnce(err);

      await expect(job.run()).rejects.toThrow('escalation failed');
      expect(jobLogger.recordFailure).toHaveBeenCalledWith('priority-escalation', err);
      expect(jobLogger.recordSuccess).not.toHaveBeenCalled();
    });
  });
});
