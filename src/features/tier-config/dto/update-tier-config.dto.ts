import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateTierConfigDto {
  @ApiPropertyOptional({
    example: 200,
    minimum: 0,
    description:
      'Minimum accumulated loyalty points required to qualify for this tier.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minLoyaltyPoints?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingWindowDays?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priorityLevel?: number;

  @ApiPropertyOptional({
    example: 1.5,
    minimum: 0,
    description: 'Points awarded per 1,000 VND spent (can be fractional).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pointsPer1000Vnd?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    description:
      'Discount percent applied during golden hours for this tier (0–100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}
