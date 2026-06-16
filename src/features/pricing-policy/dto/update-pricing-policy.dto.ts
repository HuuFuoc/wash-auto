import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Body for `PATCH /admin/pricing-policy`. The single tunable knob: the ceiling
 * for the golden-hour + tier discount stack, applied before vouchers.
 */
export class UpdatePricingPolicyDto {
  @ApiProperty({
    example: 50,
    minimum: 0,
    maximum: 100,
    description:
      'Max combined golden-hour + tier discount percent, applied before any ' +
      'voucher. The booking price is clamped down to this.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxStackedDiscountPercent: number;
}
