import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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

  // ─── voucher economics ─────────────────────────────────────────────────────
  // Previously hardcoded in LoyaltyService, so changing a threshold meant a
  // deploy. Lowering `washesPerRewardVoucher` never destroys progress already
  // accumulated: the milestone check is `>=`, and the threshold is subtracted
  // on payout, so any surplus carries into the next voucher.

  @ApiPropertyOptional({
    example: 8,
    minimum: 1,
    description: 'Valid washes needed before a reward voucher is minted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  washesPerRewardVoucher?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    description: 'Percent of accumulated spend the reward voucher is worth.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  voucherRewardRatePercent?: number;

  @ApiPropertyOptional({
    example: 1.5,
    minimum: 0.1,
    description: 'Scales the computed reward. >1 rewards a higher tier more.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  voucherRewardMultiplier?: number;

  @ApiPropertyOptional({ example: 30000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  voucherRewardFloorVnd?: number;

  @ApiPropertyOptional({ example: 150000, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  voucherRewardCeilVnd?: number;

  @ApiPropertyOptional({
    example: 40000,
    minimum: 0,
    description: 'An order below this does not count toward the milestone.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumValidWashVnd?: number;

  @ApiPropertyOptional({ example: 180, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  voucherExpiryDays?: number;

  @ApiPropertyOptional({
    example: 100000,
    minimum: 0,
    description: 'Birthday gift for this tier. 0 disables it.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  birthdayVoucherVnd?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this tier may claim tier-restricted campaigns.',
  })
  @IsOptional()
  @IsBoolean()
  exclusiveCampaignAccess?: boolean;
}
