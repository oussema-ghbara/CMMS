import { IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RecordPartReturnDto {
  @ApiProperty()
  @IsString()
  partId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ description: 'Work order ID the parts are being returned from.' })
  @IsString()
  workOrderId: string;
}
