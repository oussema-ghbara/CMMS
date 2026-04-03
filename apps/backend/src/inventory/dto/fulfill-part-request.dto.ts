import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FulfillPartRequestDto {
  @ApiPropertyOptional({
    description: 'Quantity to fulfill. Defaults to requested quantity. Capped at current stock.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}
