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

  @ApiProperty({ enum: TierNameEnum, example: TierNameEnum.MEMBER })
  tierName: TierNameEnum;

  @ApiProperty({ example: 0 })
  pointsBalance: number;

  @ApiProperty({ example: 0 })
  visitsThisMonth: number;

  @ApiProperty({ example: 0 })
  visitsLastMonth: number;

  @ApiProperty({ example: 0 })
  consecutiveLowMonths: number;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  tierReviewedAt?: Date;

  @ApiPropertyOptional({ example: '2027-05-15T00:00:00.000Z' })
  pointsExpireAt?: Date;

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
    dto.visitsThisMonth = doc.visits_this_month;
    dto.visitsLastMonth = doc.visits_last_month;
    dto.consecutiveLowMonths = doc.consecutive_low_months;
    dto.tierReviewedAt = doc.tier_reviewed_at;
    dto.pointsExpireAt = doc.points_expire_at;
    return dto;
  }
}
