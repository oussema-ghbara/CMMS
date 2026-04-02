import { Injectable, BadRequestException } from '@nestjs/common';
import { LocationsRepository } from './locations.repository';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly repo: LocationsRepository) {}

  findAll() {
    return this.repo.findAll();
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  create(dto: CreateLocationDto) {
    return this.repo.create(dto);
  }

  update(id: string, dto: UpdateLocationDto) {
    return this.repo.update(id, dto);
  }

  async delete(id: string) {
    try {
      await this.repo.delete(id);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot delete')) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
