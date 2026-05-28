import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoucherTypeEnum } from '../../voucher/types/voucher-type.enum';
import { TierConfigDocument } from '../entities/tier-config.entity';
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

  @ApiPropertyOptional({
    enum: VoucherTypeEnum,
    example: VoucherTypeEnum.BRONZE_FREE_BASIC,
    description:
      'Voucher type minted when a customer at this tier completes the wash ' +
      'milestone. Omitted when the tier produces no milestone voucher.',
  })
  voucherTypeOnMilestone?: VoucherTypeEnum;

  @ApiProperty({
    example: 40000,
    description:
      'Discount cap (VND) baked into the voucher minted at the milestone. ' +
      '0 means the tier does not mint a voucher.',
  })
  voucherCapVnd: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: TierConfigDocument): TierConfigResponseDto {
    const dto = new TierConfigResponseDto();
    dto.id = doc._id.toString();
    dto.tierName = doc.tier_name;
    dto.minLoyaltyPoints = doc.min_loyalty_points;
    dto.bookingWindowDays = doc.booking_window_days;
    dto.priorityLevel = doc.priority_level;
    dto.pointsPer1000Vnd = doc.points_per_1000_vnd;
    dto.discountPercent = doc.discount_percent;
    dto.voucherTypeOnMilestone = doc.voucher_type_on_milestone;
    dto.voucherCapVnd = doc.voucher_cap_vnd;
    dto.isActive = doc.is_active;
    return dto;
  }
}
