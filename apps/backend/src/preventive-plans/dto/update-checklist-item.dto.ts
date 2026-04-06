import { PartialType } from '@nestjs/swagger';
import { CreatePlanChecklistItemDto } from './create-checklist-item.dto';

export class UpdatePlanChecklistItemDto extends PartialType(CreatePlanChecklistItemDto) {}
