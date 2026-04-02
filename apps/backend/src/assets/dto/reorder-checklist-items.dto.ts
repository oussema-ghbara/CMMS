import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderChecklistItemsDto {
  @ApiProperty({ description: 'Ordered array of checklist item IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds: string[];
}
