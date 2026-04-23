import { Module } from '@nestjs/common';
import { PartsController } from './parts.controller';
import { PartRequestsController } from './part-requests.controller';
import { StockController } from './stock.controller';
import { InventoryService } from './inventory.service';
import { PartRequestsService } from './part-requests.service';
import { InventoryRepository } from './inventory.repository';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [AssetsModule],
  controllers: [PartsController, PartRequestsController, StockController],
  providers: [InventoryService, PartRequestsService, InventoryRepository],
  exports: [InventoryService, PartRequestsService],
})
export class InventoryModule {}
