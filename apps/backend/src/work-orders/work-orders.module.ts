import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { AssignmentService } from './assignment.service';
import { InterventionService } from './intervention.service';
import { OnHoldService } from './on-hold.service';
import { ValidationService } from './validation.service';
import { ChecklistService } from './checklist.service';
import { AssetsModule } from '../assets/assets.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AssetsModule, InventoryModule],
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    WorkOrdersRepository,
    AssignmentService,
    InterventionService,
    OnHoldService,
    ValidationService,
    ChecklistService,
  ],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
