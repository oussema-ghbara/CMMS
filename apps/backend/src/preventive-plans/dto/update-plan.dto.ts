import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto';

// assetId cannot be changed — reassigning a plan to a different asset would corrupt history.
// firstDueAt is only relevant at creation time.
export class UpdatePlanDto extends PartialType(OmitType(CreatePlanDto, ['assetId', 'firstDueAt'] as const)) {}
