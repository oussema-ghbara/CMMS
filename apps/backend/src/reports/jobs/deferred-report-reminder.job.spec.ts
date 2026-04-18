/**
 * Unit tests for DeferredReportReminderJob (three-tier aging)
 *
 * Covers:
 * - 48h tier: notifies supervisors for reports deferred 48-72 h
 * - 7-day tier: notifies supervisors for reports deferred 7-8 days
 * - 14-day tier: notifies supervisors for reports deferred 14-15 days
 * - No notification when no report falls in a tier window
 * - Each tier fires its own notification with the correct type and copy
 * - Multiple reports in the same tier all get notified
 * - Tiers are independent: a report in the 7-day window does NOT also
 *   receive a 48h notification in the same run (windowed query ensures this)
 */

import { DeferredReportReminderJob } from './deferred-report-reminder.job';
import { NotificationType } from '@gmao/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReport(id: string, ref: string) {
  return { id, referenceNumber: ref, deferredAt: new Date() };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildMocks() {
  const repo = {
    findReportsDeferredInWindow: jest.fn().mockResolvedValue([]),
  };

  const notifications = {
    notifySupervisors: jest.fn().mockResolvedValue(undefined),
  };

  const job = new DeferredReportReminderJob(repo as never, notifications as never);

  return { job, repo, notifications };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeferredReportReminderJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries all three windows on every run', async () => {
    const { job, repo } = buildMocks();

    await job.run();

    // Tier 1 — 48h
    expect(repo.findReportsDeferredInWindow).toHaveBeenCalledWith(48, 72);
    // Tier 2 — 7 days
    expect(repo.findReportsDeferredInWindow).toHaveBeenCalledWith(168, 192);
    // Tier 3 — 14 days
    expect(repo.findReportsDeferredInWindow).toHaveBeenCalledWith(336, 360);

    expect(repo.findReportsDeferredInWindow).toHaveBeenCalledTimes(3);
  });

  it('sends no notifications when all tiers return empty lists', async () => {
    const { job, notifications } = buildMocks();

    await job.run();

    expect(notifications.notifySupervisors).not.toHaveBeenCalled();
  });

  describe('48-hour tier', () => {
    it('calls notifySupervisors with DEFERRED_REPORT_REMINDER and 48-h copy', async () => {
      const { job, repo, notifications } = buildMocks();
      const report = buildReport('r-1', 'RPT-001');

      repo.findReportsDeferredInWindow.mockImplementation(
        (min: number) => (min === 48 ? Promise.resolve([report]) : Promise.resolve([])),
      );

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      const [type, title, summary, entityType, entityId] =
        (notifications.notifySupervisors as jest.Mock).mock.calls[0];

      expect(type).toBe(NotificationType.DEFERRED_REPORT_REMINDER);
      expect(title).toContain('48 h');
      expect(title).toContain('RPT-001');
      expect(summary).toContain('RPT-001');
      expect(entityType).toBe('ProblemReport');
      expect(entityId).toBe('r-1');
    });

    it('notifies for each report individually when multiple reports are in the 48-h window', async () => {
      const { job, repo, notifications } = buildMocks();
      const r1 = buildReport('r-1', 'RPT-001');
      const r2 = buildReport('r-2', 'RPT-002');

      repo.findReportsDeferredInWindow.mockImplementation(
        (min: number) => (min === 48 ? Promise.resolve([r1, r2]) : Promise.resolve([])),
      );

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(2);
    });
  });

  describe('7-day tier', () => {
    it('calls notifySupervisors with DEFERRED_REPORT_REMINDER and 7-day copy', async () => {
      const { job, repo, notifications } = buildMocks();
      const report = buildReport('r-7d', 'RPT-007');

      repo.findReportsDeferredInWindow.mockImplementation(
        (min: number) => (min === 168 ? Promise.resolve([report]) : Promise.resolve([])),
      );

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      const [type, title, summary] =
        (notifications.notifySupervisors as jest.Mock).mock.calls[0];

      expect(type).toBe(NotificationType.DEFERRED_REPORT_REMINDER);
      expect(title).toContain('7 jours');
      expect(summary).toContain('7 jours');
    });
  });

  describe('14-day tier', () => {
    it('calls notifySupervisors with DEFERRED_REPORT_REMINDER and 14-day copy', async () => {
      const { job, repo, notifications } = buildMocks();
      const report = buildReport('r-14d', 'RPT-014');

      repo.findReportsDeferredInWindow.mockImplementation(
        (min: number) => (min === 336 ? Promise.resolve([report]) : Promise.resolve([])),
      );

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      const [type, title, summary] =
        (notifications.notifySupervisors as jest.Mock).mock.calls[0];

      expect(type).toBe(NotificationType.DEFERRED_REPORT_REMINDER);
      expect(title).toContain('14 jours');
      expect(summary).toContain('14 jours');
    });

    it('escalation title contains a visual urgency marker', async () => {
      const { job, repo, notifications } = buildMocks();
      repo.findReportsDeferredInWindow.mockImplementation(
        (min: number) =>
          min === 336
            ? Promise.resolve([buildReport('r-esc', 'RPT-ESC')])
            : Promise.resolve([]),
      );

      await job.run();

      const title = (notifications.notifySupervisors as jest.Mock).mock.calls[0][1] as string;
      expect(title).toContain('⚠');
    });
  });

  describe('tier isolation (no double notifications)', () => {
    it('a report in the 7-day window does NOT trigger the 48h or 14d notifications', async () => {
      const { job, repo, notifications } = buildMocks();

      repo.findReportsDeferredInWindow.mockImplementation((min: number) => {
        // Only the 7-day tier returns a report
        if (min === 168) return Promise.resolve([buildReport('r-7d', 'RPT-7D')]);
        return Promise.resolve([]);
      });

      await job.run();

      // Only one call — for the 7-day tier
      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(1);
      const title = (notifications.notifySupervisors as jest.Mock).mock.calls[0][1] as string;
      expect(title).toContain('7 jours');
    });

    it('a single run with reports in all three tiers fires 3 separate notifications', async () => {
      const { job, repo, notifications } = buildMocks();

      repo.findReportsDeferredInWindow.mockImplementation((min: number) => {
        if (min === 48) return Promise.resolve([buildReport('r-48', 'RPT-48H')]);
        if (min === 168) return Promise.resolve([buildReport('r-7', 'RPT-7D')]);
        if (min === 336) return Promise.resolve([buildReport('r-14', 'RPT-14D')]);
        return Promise.resolve([]);
      });

      await job.run();

      expect(notifications.notifySupervisors).toHaveBeenCalledTimes(3);

      const calls = (notifications.notifySupervisors as jest.Mock).mock.calls;
      const titles = calls.map((c: unknown[]) => c[1] as string);

      expect(titles.some((t) => t.includes('48 h'))).toBe(true);
      expect(titles.some((t) => t.includes('7 jours'))).toBe(true);
      expect(titles.some((t) => t.includes('14 jours'))).toBe(true);
    });
  });
});
