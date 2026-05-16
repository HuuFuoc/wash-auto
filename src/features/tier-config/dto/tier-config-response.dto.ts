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

  @ApiProperty({ example: 3 })
  bookingWindowDays: number;

  @ApiProperty({ example: 0 })
  priorityLevel: number;

  @ApiProperty({ example: 10 })
  pointsPerWash: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: TierConfigDocument): TierConfigResponseDto {
    const dto = new TierConfigResponseDto();
    dto.id = doc._id.toString();
    dto.tierName = doc.tier_name;
    dto.minVisitsPerMonth = doc.min_visits_per_month;
    dto.bookingWindowDays = doc.booking_window_days;
    dto.priorityLevel = doc.priority_level;
    dto.pointsPerWash = doc.points_per_wash;
    dto.isActive = doc.is_active;
    return dto;
  }
}
