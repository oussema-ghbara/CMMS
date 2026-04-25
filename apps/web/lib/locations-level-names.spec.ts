import { locationsApi } from './locations.api';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('locationsApi level names', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getLevelNames()', () => {
    it('requests GET /locations/level-names and returns the array', async () => {
      const payload = [
        { level: 1, name: 'Bâtiment' },
        { level: 2, name: 'Niveau' },
        { level: 3, name: 'Zone' },
        { level: 4, name: 'Salle' },
        { level: 5, name: 'Sous-zone' },
      ];
      (api.get as jest.Mock).mockResolvedValue({ data: payload });

      const result = await locationsApi.getLevelNames();

      expect(api.get).toHaveBeenCalledWith('/locations/level-names');
      expect(result).toEqual(payload);
    });

    it('propagates network errors', async () => {
      (api.get as jest.Mock).mockRejectedValue(new Error('Network error'));
      await expect(locationsApi.getLevelNames()).rejects.toThrow('Network error');
    });
  });

  describe('setLevelNames()', () => {
    it('sends PATCH /locations/level-names with items wrapper and returns updated array', async () => {
      const items = [{ level: 2, name: 'Niveau' }];
      const response = [
        { level: 1, name: 'Bâtiment' },
        { level: 2, name: 'Niveau' },
      ];
      (api.patch as jest.Mock).mockResolvedValue({ data: response });

      const result = await locationsApi.setLevelNames(items);

      expect(api.patch).toHaveBeenCalledWith('/locations/level-names', { items });
      expect(result).toEqual(response);
    });

    it('propagates network errors', async () => {
      (api.patch as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
      await expect(locationsApi.setLevelNames([])).rejects.toThrow('Unauthorized');
    });
  });
});
