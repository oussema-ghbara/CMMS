import { Test, TestingModule } from '@nestjs/testing';
import { LocationsService } from './locations.service';
import { LocationsRepository } from './locations.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { UpdateLevelNamesDto } from './dto/update-level-names.dto';

const ACTOR_ID = 'actor-1';

describe('LocationsService — level names (§4.1, §6.2)', () => {
  let service: LocationsService;
  let systemConfig: jest.Mocked<SystemConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: LocationsRepository, useValue: {} },
        { provide: PrismaService, useValue: {} },
        {
          provide: SystemConfigService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(LocationsService);
    systemConfig = module.get(SystemConfigService);
  });

  describe('getLevelNames()', () => {
    it('returns default French names when no config stored', async () => {
      systemConfig.get.mockResolvedValue(null);

      const result = await service.getLevelNames();

      expect(result).toHaveLength(5);
      expect(result.find((r) => r.level === 1)?.name).toBe('Bâtiment');
      expect(result.find((r) => r.level === 2)?.name).toBe('Étage');
      expect(result.find((r) => r.level === 3)?.name).toBe('Zone');
      expect(result.find((r) => r.level === 4)?.name).toBe('Salle');
      expect(result.find((r) => r.level === 5)?.name).toBe('Sous-zone');
    });

    it('returns configured name when stored in SystemConfig', async () => {
      systemConfig.get.mockImplementation(async (key) => {
        if (key === 'LOCATION_LEVEL_2_NAME') return 'Niveau';
        return null;
      });

      const result = await service.getLevelNames();

      expect(result.find((r) => r.level === 2)?.name).toBe('Niveau');
      // Others still default
      expect(result.find((r) => r.level === 1)?.name).toBe('Bâtiment');
    });

    it('returns all 5 levels in order', async () => {
      systemConfig.get.mockResolvedValue(null);

      const result = await service.getLevelNames();

      expect(result.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    });

    it('reads the correct SystemConfig key per level', async () => {
      systemConfig.get.mockResolvedValue(null);
      await service.getLevelNames();

      expect(systemConfig.get).toHaveBeenCalledWith('LOCATION_LEVEL_1_NAME');
      expect(systemConfig.get).toHaveBeenCalledWith('LOCATION_LEVEL_3_NAME');
      expect(systemConfig.get).toHaveBeenCalledWith('LOCATION_LEVEL_5_NAME');
    });
  });

  describe('setLevelNames()', () => {
    it('writes each item to SystemConfig and returns updated names', async () => {
      systemConfig.set.mockResolvedValue(undefined);
      systemConfig.get.mockImplementation(async (key) => {
        const map: Record<string, string> = {
          LOCATION_LEVEL_1_NAME: 'Site',
          LOCATION_LEVEL_2_NAME: 'Bâtiment',
        };
        return map[key] ?? null;
      });

      const dto: UpdateLevelNamesDto = {
        items: [
          { level: 1, name: 'Site' },
          { level: 2, name: 'Bâtiment' },
        ],
      };

      const result = await service.setLevelNames(dto, ACTOR_ID);

      expect(systemConfig.set).toHaveBeenCalledWith('LOCATION_LEVEL_1_NAME', 'Site', ACTOR_ID);
      expect(systemConfig.set).toHaveBeenCalledWith('LOCATION_LEVEL_2_NAME', 'Bâtiment', ACTOR_ID);
      expect(result).toHaveLength(5);
      expect(result.find((r) => r.level === 1)?.name).toBe('Site');
    });

    it('persists only the levels provided — does not wipe other levels', async () => {
      systemConfig.set.mockResolvedValue(undefined);
      systemConfig.get.mockImplementation(async (key) => {
        if (key === 'LOCATION_LEVEL_3_NAME') return 'Atelier';
        return null;
      });

      const dto: UpdateLevelNamesDto = { items: [{ level: 1, name: 'Complexe' }] };
      const result = await service.setLevelNames(dto, ACTOR_ID);

      expect(systemConfig.set).toHaveBeenCalledTimes(1);
      // Level 3 retains its stored value
      expect(result.find((r) => r.level === 3)?.name).toBe('Atelier');
    });

    it('calls getLevelNames after persisting and returns the refreshed list', async () => {
      systemConfig.set.mockResolvedValue(undefined);
      systemConfig.get.mockResolvedValue('Personnalisé');

      const dto: UpdateLevelNamesDto = { items: [{ level: 4, name: 'Personnalisé' }] };
      const result = await service.setLevelNames(dto, ACTOR_ID);

      // All 5 levels returned, read from config (mocked to return 'Personnalisé')
      expect(result).toHaveLength(5);
    });
  });
});
