import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { LoyaltyAccountDocument } from '../../../modules/loyalty/loyalty-account.model';
import { TierConfigDocument } from '../../../modules/tier-config/tier-config.model';
import { TierNameEnum } from '../../tier-config/types/tier-name.enum';

/**
 * Everything the app needs to render the loyalty screen, computed SERVER-SIDE.
 *
 * The gamification figures below (progress to the next tier, washes left to the
 * next voucher, estimated reward) used to have no home, which forced the client
 * to fetch every tier config and re-derive the business rules itself — a copy
 * that silently goes stale the moment an operator edits a tier.
 */
export class LoyaltyAccountResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  tierConfigId: string;

  @ApiProperty({ enum: TierNameEnum, example: TierNameEnum.NONE })
  tierName: TierNameEnum;

  @ApiProperty({ example: 0 })
  pointsBalance: number;

  @ApiProperty({
    example: 3,
    description:
      'Washes completed since the last reward voucher. NOT reset annually — ' +
      'progress toward a voucher is independent of the calendar year.',
  })
  successfulWashesTowardVoucher: number;

  @ApiProperty({
    example: 13,
    description: 'Lifetime count of completed orders for this customer.',
  })
  totalSuccessfulWashes: number;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  lastAnnualResetAt?: Date;

  // ─── tier progress ─────────────────────────────────────────────────────────

  @ApiProperty({
    example: 2,
    description: 'Rank of the current tier. Higher is better.',
  })
  currentTierRank: number;

  @ApiPropertyOptional({
    enum: TierNameEnum,
    example: TierNameEnum.GOLD,
    description: 'Absent when the customer is already at the top tier.',
  })
  nextTier?: TierNameEnum;

  @ApiPropertyOptional({
    example: 180,
    description: 'Points still needed for nextTier. Absent at the top tier.',
  })
  pointsToNextTier?: number;

  @ApiProperty({
    example: 64,
    description:
      'Progress through the CURRENT tier band, 0-100. 100 at the top tier.',
  })
  progressPercent: number;

  // ─── voucher milestone ─────────────────────────────────────────────────────

  @ApiProperty({
    example: 8,
    description: "This tier's wash milestone for a reward voucher.",
  })
  washesRequiredForNextVoucher: number;

  @ApiProperty({
    example: 5,
    description: 'Washes still needed before the next reward voucher.',
  })
  washesRemainingForNextVoucher: number;

  @ApiProperty({
    example: 55000,
    description:
      'Estimated VND of the next reward voucher, from the same formula that ' +
      'mints it. An estimate: the final value depends on what is actually spent.',
  })
  estimatedNextVoucherVnd: number;

  // ─── lifetime ──────────────────────────────────────────────────────────────

  @ApiProperty({
    example: 4320,
    description: 'Every point ever earned. Survives the annual reset.',
  })
  lifetimePoints: number;

  @ApiProperty({ example: 8600000, description: 'Lifetime spend, in VND.' })
  lifetimeSpendVnd: number;

  @ApiProperty({
    example: 340000,
    description: 'Total VND discounts have saved this customer, all time.',
  })
  totalSavedVnd: number;

  static fromDocument(
    doc: LoyaltyAccountDocument,
    tier: TierConfigDocument,
    /** Active tiers ascending by priority, so the next rung can be resolved. */
    ladder: TierConfigDocument[] = [],
    /** Estimated value of the next reward voucher, computed by the service. */
    estimatedNextVoucherVnd = 0,
  ): LoyaltyAccountResponseDto {
    const dto = new LoyaltyAccountResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.tierConfigId = doc.tier_config_id.toString();
    dto.tierName = tier.tier_name;
    dto.pointsBalance = doc.points_balance;
    dto.successfulWashesTowardVoucher = doc.successful_washes_toward_voucher;
    dto.totalSuccessfulWashes = doc.total_successful_washes;
    dto.lastAnnualResetAt = doc.last_annual_reset_at;

    dto.currentTierRank = tier.priority_level;
    const next = ladder.find((t) => t.priority_level > tier.priority_level);
    if (next) {
      dto.nextTier = next.tier_name;
      dto.pointsToNextTier = Math.max(
        0,
        next.min_loyalty_points - doc.points_balance,
      );
      const band = next.min_loyalty_points - tier.min_loyalty_points;
      dto.progressPercent =
        band > 0
          ? Math.min(
              100,
              Math.max(
                0,
                Math.round(
                  ((doc.points_balance - tier.min_loyalty_points) / band) * 100,
                ),
              ),
            )
          : 100;
    } else {
      // Top of the ladder: there is nothing left to progress toward.
      dto.progressPercent = 100;
    }

    dto.washesRequiredForNextVoucher = tier.washes_per_reward_voucher;
    dto.washesRemainingForNextVoucher = Math.max(
      0,
      tier.washes_per_reward_voucher - doc.successful_washes_toward_voucher,
    );
    dto.estimatedNextVoucherVnd = estimatedNextVoucherVnd;

    dto.lifetimePoints = doc.lifetime_points;
    dto.lifetimeSpendVnd = doc.lifetime_spend_vnd;
    dto.totalSavedVnd = doc.lifetime_saved_vnd;
    return dto;
  }
}
