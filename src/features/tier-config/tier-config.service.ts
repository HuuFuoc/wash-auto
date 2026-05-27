import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SetTierConfigStatusDto } from './dto/set-tier-config-status.dto';
import { TierConfigResponseDto } from './dto/tier-config-response.dto';
import { UpdateTierConfigDto } from './dto/update-tier-config.dto';
import { TierConfigRepository } from './repositories/tier-config.repository';
import { TierNameEnum } from './types/tier-name.enum';

interface IDefaultTier {
  tierName: TierNameEnum;
  minLoyaltyPoints: number;
  bookingWindowDays: number;
  priorityLevel: number;
  pointsPer1000Vnd: number;
  discountPercent: number;
}

// 4-tier loyalty ladder driven by accumulated loyalty points.
//   None   — <  200  điểm,  0% giảm
//   Bronze —  >= 200  điểm,  5% giảm
//   Silver —  >= 500  điểm, 10% giảm
//   Gold   —  >= 1000 điểm, 15% giảm
// Tier discount only applies when the booking falls inside a configured
// golden hour (see GoldenHourConfigService).
const DEFAULT_TIERS: IDefaultTier[] = [
  {
    tierName: TierNameEnum.NONE,
    minLoyaltyPoints: 0,
    bookingWindowDays: 7,
    priorityLevel: 0,
    pointsPer1000Vnd: 1,
    discountPercent: 0,
  },
  {
    tierName: TierNameEnum.BRONZE,
    minLoyaltyPoints: 200,
    bookingWindowDays: 10,
    priorityLevel: 1,
    pointsPer1000Vnd: 1.5,
    discountPercent: 5,
  },
  {
    tierName: TierNameEnum.SILVER,
    minLoyaltyPoints: 500,
    bookingWindowDays: 12,
    priorityLevel: 2,
    pointsPer1000Vnd: 2,
    discountPercent: 10,
  },
  {
    tierName: TierNameEnum.GOLD,
    minLoyaltyPoints: 1000,
    bookingWindowDays: 14,
    priorityLevel: 3,
    pointsPer1000Vnd: 3,
    discountPercent: 15,
  },
];

@Injectable()
export class TierConfigService {
  private readonly logger = new Logger(TierConfigService.name);

  constructor(private readonly repository: TierConfigRepository) {}

  async seedDefaults(): Promise<void> {
    // Detect whether the live collection still holds the previous schema
    // (Member/Platinum names, or any doc missing the new min_loyalty_points
    // field, or priority_level values that collide with the new layout).
    // When dirty we wipe the collection — partial deletes leave legacy
    // priority_level values that then clash on E11000 with the unique index.
    const existing = await this.repository.findAll();
    const canonical = new Set<string>(DEFAULT_TIERS.map((t) => t.tierName));
    const isLegacySchema = existing.some(
      (doc) =>
        !canonical.has(doc.tier_name) ||
        doc.min_loyalty_points === undefined ||
        doc.min_loyalty_points === null,
    );

    if (isLegacySchema) {
      const dropped = await this.repository.deleteAll();
      this.logger.warn(
        `Legacy tier_configs schema detected — dropped ${dropped} rows for reseed`,
      );
    }

    for (const tier of DEFAULT_TIERS) {
      try {
        await this.repository.upsertByName(tier);
      } catch (err) {
        // Tolerate E11000: another serverless instance is racing the same
        // seed after a parallel cold start. The peer has already inserted
        // the canonical doc, so we can safely move on.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/E11000|duplicate key/i.test(msg)) throw err;
        this.logger.log(
          `Race on upsert ${tier.tierName} — already inserted by peer`,
        );
      }
    }
    this.logger.log(`Seeded ${DEFAULT_TIERS.length} tier_configs`);
  }

  async listActive(): Promise<TierConfigResponseDto[]> {
    const docs = await this.repository.findActive();
    return docs.map((d) => TierConfigResponseDto.fromDocument(d));
  }

  async listAll(): Promise<TierConfigResponseDto[]> {
    const docs = await this.repository.findAll();
    return docs.map((d) => TierConfigResponseDto.fromDocument(d));
  }

  async getById(id: string): Promise<TierConfigResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid tier id');
    }
    const doc = await this.repository.findById(id);
    if (!doc) {
      throw new NotFoundException('Tier not found');
    }
    return TierConfigResponseDto.fromDocument(doc);
  }

  async update(
    id: string,
    dto: UpdateTierConfigDto,
  ): Promise<TierConfigResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid tier id');
    }
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Tier not found');
    }

    if (
      dto.priorityLevel !== undefined &&
      dto.priorityLevel !== existing.priority_level
    ) {
      if (
        await this.repository.existsByPriorityLevelExcept(
          dto.priorityLevel,
          existing._id,
        )
      ) {
        throw new ConflictException(
          `priorityLevel ${dto.priorityLevel} already used by another tier`,
        );
      }
    }

    const doc = await this.repository.update(id, dto);
    if (!doc) throw new NotFoundException('Tier not found');
    return TierConfigResponseDto.fromDocument(doc);
  }

  async setStatus(
    id: string,
    dto: SetTierConfigStatusDto,
  ): Promise<TierConfigResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid tier id');
    }
    const doc = await this.repository.setActive(id, dto.isActive);
    if (!doc) throw new NotFoundException('Tier not found');
    return TierConfigResponseDto.fromDocument(doc);
  }
}
