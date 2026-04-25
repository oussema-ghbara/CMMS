/**
 * §9.3 — Technician load panel click-to-queue.
 *
 * Verifies that:
 * 1. WorkOrderListQuery accepts a technicianId field.
 * 2. workOrdersApi.list forwards technicianId to the GET /work-orders query params.
 */
import { workOrdersApi, type WorkOrderListQuery } from './work-orders.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
  },
}));

describe('WorkOrderListQuery — technicianId filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('technicianId is an accepted optional field on WorkOrderListQuery', () => {
    const query: WorkOrderListQuery = { technicianId: 'tech-99' };
    expect(query.technicianId).toBe('tech-99');
  });

  it('passes technicianId to GET /work-orders as a query param', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ technicianId: 'tech-99' });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { technicianId: 'tech-99' },
    });
  });

  it('omits technicianId from params when not set', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ page: 1 });

    const call = (api.get as jest.Mock).mock.calls[0];
    expect(call[1].params).not.toHaveProperty('technicianId');
  });

  it('can combine technicianId with other filters', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [], total: 0 } });

    await workOrdersApi.list({ technicianId: 'tech-5', status: 'IN_PROGRESS' as never });

    expect(api.get).toHaveBeenCalledWith('/work-orders', {
      params: { technicianId: 'tech-5', status: 'IN_PROGRESS' },
    });
  });
});
