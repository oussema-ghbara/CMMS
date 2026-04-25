import { workOrdersApi } from './work-orders.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('workOrdersApi.getById', () => {
  it('requests /work-orders/:id and returns payload including validation insights', async () => {
    const payload = {
      id: 'wo-1',
      contributorsWithoutLog: [{ technicianId: 'tech-2', name: 'Contributor B' }],
      hasNotableTimeDeviation: true,
      timeDeviation: {
        estimatedDurationMinutes: 120,
        actualDurationMinutes: 170,
        deltaMinutes: 50,
        deltaPercent: 41.67,
      },
    };

    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getById('wo-1');

    expect(api.get).toHaveBeenCalledWith('/work-orders/wo-1');
    expect(result).toEqual(payload);
  });

  it('intervention logs include isReassignmentRemnant field', async () => {
    const log = {
      id: 'log-1',
      technicianId: 'tech-1',
      technician: { id: 'tech-1', name: 'Alice' },
      startedAt: '2026-04-20T10:00:00Z',
      endedAt: '2026-04-20T11:00:00Z',
      activeDurationMinutes: 60,
      result: null,
      resultExplanation: null,
      hourlyRateAtTime: null,
      isReassignmentRemnant: true,
      actions: [],
    };
    const payload = { id: 'wo-1', interventionLogs: [log] };

    (api.get as jest.Mock).mockResolvedValue({ data: payload });

    const result = await workOrdersApi.getById('wo-1');

    expect(result.interventionLogs?.[0].isReassignmentRemnant).toBe(true);
  });
});

describe('workOrdersApi.promote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends newPrincipalId with optional reason and reasonDetail', async () => {
    const payload = { id: 'wo-1' };
    (api.patch as jest.Mock).mockResolvedValue({ data: payload });

    await workOrdersApi.promote('wo-1', {
      newPrincipalId: 'tech-new',
      reason: 'SPECIFIC_SKILL_REQUIRED' as never,
      reasonDetail: 'Welding expertise needed',
    });

    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo-1/promote', {
      newPrincipalId: 'tech-new',
      reason: 'SPECIFIC_SKILL_REQUIRED',
      reasonDetail: 'Welding expertise needed',
    });
  });

  it('sends only newPrincipalId when reason is omitted', async () => {
    const payload = { id: 'wo-1' };
    (api.patch as jest.Mock).mockResolvedValue({ data: payload });

    await workOrdersApi.promote('wo-1', { newPrincipalId: 'tech-new' });

    expect(api.patch).toHaveBeenCalledWith('/work-orders/wo-1/promote', {
      newPrincipalId: 'tech-new',
    });
  });
});

describe('workOrdersApi.list — technicianId filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes technicianId to the GET /work-orders query string', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ technicianId: 'tech-42' });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { technicianId: 'tech-42' },
    });
  });

  it('omits technicianId when not provided', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ status: 'OPEN' as never });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { status: 'OPEN' },
    });
  });
});
