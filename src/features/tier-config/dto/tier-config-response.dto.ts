import { ApiProperty } from '@nestjs/swagger';
import { TierConfigDocument } from '../entities/tier-config.entity';
import { TierNameEnum } from '../types/tier-name.enum';

export class TierConfigResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ enum: TierNameEnum, example: TierNameEnum.MEMBER })
  tierName: TierNameEnum;

  @ApiProperty({ example: 0 })
  minVisitsPerMonth: number;

  @ApiProperty({ example: 7 })
  bookingWindowDays: number;

  @ApiProperty({ example: 0 })
  priorityLevel: number;

  @ApiProperty({
    example: 1,
    description: 'Points awarded per 1,000 VND spent (can be fractional).',
  })
  pointsPer1000Vnd: number;

  @ApiProperty({
    example: 0,
    description: 'Discount percent applied per wash for this tier (0–100).',
  })
  discountPercent: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: TierConfigDocument): TierConfigResponseDto {
    const dto = new TierConfigResponseDto();
    dto.id = doc._id.toString();
    dto.tierName = doc.tier_name;
    dto.minVisitsPerMonth = doc.min_visits_per_month;
    dto.bookingWindowDays = doc.booking_window_days;
    dto.priorityLevel = doc.priority_level;
    dto.pointsPer1000Vnd = doc.points_per_1000_vnd;
    dto.discountPercent = doc.discount_percent;
    dto.isActive = doc.is_active;
    return dto;
  }
}
