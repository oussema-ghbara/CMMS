import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { LocationsRepository } from './locations.repository';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateLevelNamesDto } from './dto/update-level-names.dto';

export interface LevelNameItem {
  level: number;
  name: string;
}

const SUPPORTED_LEVELS = [1, 2, 3, 4, 5] as const;
const DEFAULT_LEVEL_NAMES: Record<number, string> = {
  1: 'Bâtiment',
  2: 'Étage',
  3: 'Zone',
  4: 'Salle',
  5: 'Sous-zone',
};

function levelConfigKey(level: number): string {
  return `LOCATION_LEVEL_${level}_NAME`;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly repo: LocationsRepository,
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  findAll() {
    return this.repo.findAll();
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  async create(dto: CreateLocationDto, actorId: string) {
    const location = await this.repo.create(dto);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'LOCATION_CREATED',
        targetType: 'Location',
        targetId: location.id,
        valueAfter: {
          name: location.name,
          code: location.code,
          description: location.description,
          level: location.level,
          fullPath: location.fullPath,
          parentId: location.parentId,
        },
      },
    });

    this.logger.log(`Location created: ${location.id} (${location.name}) by user ${actorId}`);
    return location;
  }

  async update(id: string, dto: UpdateLocationDto, actorId: string) {
    const before = await this.repo.findById(id);
    const location = await this.repo.update(id, dto);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'LOCATION_UPDATED',
        targetType: 'Location',
        targetId: id,
        valueBefore: {
          name: before.name,
          code: before.code,
          description: before.description,
          level: before.level,
          fullPath: before.fullPath,
          parentId: before.parentId,
        },
        valueAfter: {
          name: location.name,
          code: location.code,
          description: location.description,
          level: location.level,
          fullPath: location.fullPath,
          parentId: location.parentId,
        },
      },
    });

    this.logger.log(`Location updated: ${id} by user ${actorId}`);
    return location;
  }

  async getLevelNames(): Promise<LevelNameItem[]> {
    const results = await Promise.all(
      SUPPORTED_LEVELS.map(async (level) => {
        const stored = await this.systemConfig.get(levelConfigKey(level));
        return { level, name: stored ?? DEFAULT_LEVEL_NAMES[level]! };
      }),
    );
    return results;
  }

  async setLevelNames(dto: UpdateLevelNamesDto, actorId: string): Promise<LevelNameItem[]> {
    await Promise.all(
      dto.items.map((item) =>
        this.systemConfig.set(levelConfigKey(item.level), item.name, actorId),
      ),
    );
    this.logger.log(`Location level names updated by user ${actorId}`);
    return this.getLevelNames();
  }

  async delete(id: string, actorId: string) {
    const location = await this.repo.findById(id);
    try {
      await this.repo.delete(id);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot delete')) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actionType: 'LOCATION_DELETED',
        targetType: 'Location',
        targetId: id,
        valueBefore: {
          name: location.name,
          code: location.code,
          description: location.description,
          level: location.level,
          fullPath: location.fullPath,
          parentId: location.parentId,
        },
      },
    });

    this.logger.log(`Location deleted: ${id} by user ${actorId}`);
  }
}
