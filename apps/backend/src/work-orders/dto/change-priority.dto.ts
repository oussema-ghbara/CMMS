import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderPriority } from '@gmao/shared';

export class ChangePriorityDto {
  @ApiProperty({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority)
  priority: WorkOrderPriority;
}
