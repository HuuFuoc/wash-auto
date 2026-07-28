import { ApiProperty } from '../../../common/swagger-shim';
import { TierConfigDocument } from '../../../modules/tier-config/tier-config.model';
import { TierNameEnum } from '../types/tier-name.enum';

export class TierConfigResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ enum: TierNameEnum, example: TierNameEnum.NONE })
  tierName: TierNameEnum;

  @ApiProperty({
    example: 200,
    description:
      'Minimum accumulated loyalty points required to qualify for this tier.',
  })
  minLoyaltyPoints: number;

  @ApiProperty({ example: 10 })
  bookingWindowDays: number;

  @ApiProperty({ example: 1 })
  priorityLevel: number;

  @ApiProperty({
    example: 1.5,
    description: 'Points awarded per 1,000 VND spent (can be fractional).',
  })
  pointsPer1000Vnd: number;

  @ApiProperty({
    example: 5,
    description:
      'Discount percent applied during golden hours for this tier (0–100).',
  })
  discountPercent: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  // ─── voucher economics ─────────────────────────────────────────────────────
  // Public so the app can render an honest "what you unlock at Gold" table
  // instead of hardcoding the ladder's benefits client-side.

  @ApiProperty({ example: 8 })
  washesPerRewardVoucher: number;

  @ApiProperty({ example: 5 })
  voucherRewardRatePercent: number;

  @ApiProperty({ example: 1.5 })
  voucherRewardMultiplier: number;

  @ApiProperty({ example: 30000 })
  voucherRewardFloorVnd: number;

  @ApiProperty({ example: 150000 })
  voucherRewardCeilVnd: number;

  @ApiProperty({ example: 40000 })
  minimumValidWashVnd: number;

  @ApiProperty({ example: 180 })
  voucherExpiryDays: number;

  @ApiProperty({ example: 100000, description: '0 = no birthday gift.' })
  birthdayVoucherVnd: number;

  @ApiProperty({ example: true })
  exclusiveCampaignAccess: boolean;

  static fromDocument(doc: TierConfigDocument): TierConfigResponseDto {
    const dto = new TierConfigResponseDto();
    dto.id = doc._id.toString();
    dto.tierName = doc.tier_name;
    dto.minLoyaltyPoints = doc.min_loyalty_points;
    dto.bookingWindowDays = doc.booking_window_days;
    dto.priorityLevel = doc.priority_level;
    dto.pointsPer1000Vnd = doc.points_per_1000_vnd;
    dto.discountPercent = doc.discount_percent;
    dto.isActive = doc.is_active;
    dto.washesPerRewardVoucher = doc.washes_per_reward_voucher;
    dto.voucherRewardRatePercent = doc.voucher_reward_rate_percent;
    dto.voucherRewardMultiplier = doc.voucher_reward_multiplier;
    dto.voucherRewardFloorVnd = doc.voucher_reward_floor_vnd;
    dto.voucherRewardCeilVnd = doc.voucher_reward_ceil_vnd;
    dto.minimumValidWashVnd = doc.minimum_valid_wash_vnd;
    dto.voucherExpiryDays = doc.voucher_expiry_days;
    dto.birthdayVoucherVnd = doc.birthday_voucher_vnd;
    dto.exclusiveCampaignAccess = doc.exclusive_campaign_access;
    return dto;
  }
}
