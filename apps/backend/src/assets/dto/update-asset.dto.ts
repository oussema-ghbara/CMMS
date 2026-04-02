import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAssetDto } from './create-asset.dto';

// categoryId and locationId remain changeable; all fields optional
export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
