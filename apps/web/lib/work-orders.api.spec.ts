import { workOrdersApi } from './work-orders.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
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
});
