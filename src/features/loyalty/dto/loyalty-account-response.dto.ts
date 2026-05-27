import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoyaltyAccountDocument } from '../entities/loyalty-account.entity';
import { TierNameEnum } from '../../tier-config/types/tier-name.enum';

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
      'Number of completed washes since the last free-wash voucher was minted. Resets to 0 at the 10-wash threshold.',
  })
  successfulWashesTowardVoucher: number;

  @ApiProperty({
    example: 13,
    description: 'Lifetime count of completed orders for this customer.',
  })
  totalSuccessfulWashes: number;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  lastAnnualResetAt?: Date;

  static fromDocument(
    doc: LoyaltyAccountDocument,
    tierName: TierNameEnum,
  ): LoyaltyAccountResponseDto {
    const dto = new LoyaltyAccountResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.tierConfigId = doc.tier_config_id.toString();
    dto.tierName = tierName;
    dto.pointsBalance = doc.points_balance;
    dto.successfulWashesTowardVoucher = doc.successful_washes_toward_voucher;
    dto.totalSuccessfulWashes = doc.total_successful_washes;
    dto.lastAnnualResetAt = doc.last_annual_reset_at;
    return dto;
  }
}
