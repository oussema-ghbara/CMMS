import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Location, Prisma } from '@gmao/db';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Location[]> {
    return this.prisma.location.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] });
  }

  async findById(id: string): Promise<Location> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { children: true, parent: true },
    });
    if (!location) throw new NotFoundException(`Location ${id} not found`);
    return location;
  }

  async create(dto: CreateLocationDto): Promise<Location> {
    let fullPath = dto.name;
    if (dto.parentId) {
      const parent = await this.prisma.location.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException(`Parent location ${dto.parentId} not found`);
      fullPath = `${parent.fullPath} → ${dto.name}`;
    }

    return this.prisma.location.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        level: dto.level,
        fullPath,
        parentId: dto.parentId,
      },
    });
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    await this.findById(id);

    const updateData: Prisma.LocationUpdateInput = {
      name: dto.name,
      code: dto.code,
      description: dto.description,
      level: dto.level,
    };

    if (dto.name || dto.parentId !== undefined) {
      const current = await this.prisma.location.findUniqueOrThrow({ where: { id } });
      const parentId = dto.parentId !== undefined ? dto.parentId : current.parentId;
      const name = dto.name ?? current.name;

      if (parentId) {
        const parent = await this.prisma.location.findUnique({ where: { id: parentId } });
        if (!parent) throw new NotFoundException(`Parent location ${parentId} not found`);
        updateData.fullPath = `${parent.fullPath} → ${name}`;
      } else {
        updateData.fullPath = name;
      }
      updateData.parent = parentId ? { connect: { id: parentId } } : { disconnect: true };
    }

    return this.prisma.location.update({ where: { id }, data: updateData });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    const hasChildren = await this.prisma.location.count({ where: { parentId: id } });
    const hasAssets = await this.prisma.asset.count({ where: { locationId: id } });

    if (hasChildren > 0) {
      throw new Error('Cannot delete a location that has child locations');
    }
    if (hasAssets > 0) {
      throw new Error('Cannot delete a location that has assigned assets');
    }

    await this.prisma.location.delete({ where: { id } });
  }
}
