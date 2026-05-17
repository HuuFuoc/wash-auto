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
  minVisitsPerMonth: number;
  bookingWindowDays: number;
  priorityLevel: number;
  pointsPer1000Vnd: number;
  discountPercent: number;
}

// Values aligned with FE landing page (wave-wash.vercel.app):
//   Member   — đặt trước 7 ngày,  1   điểm/1000đ, 0% giảm
//   Silver   — đặt trước 10 ngày, 1.5 điểm/1000đ, 5% giảm
//   Gold     — đặt trước 12 ngày, 2   điểm/1000đ, 10% giảm
//   Platinum — đặt trước 14 ngày, 3   điểm/1000đ, 15% giảm
const DEFAULT_TIERS: IDefaultTier[] = [
  {
    tierName: TierNameEnum.MEMBER,
    minVisitsPerMonth: 0,
    bookingWindowDays: 7,
    priorityLevel: 0,
    pointsPer1000Vnd: 1,
    discountPercent: 0,
  },
  {
    tierName: TierNameEnum.SILVER,
    minVisitsPerMonth: 2,
    bookingWindowDays: 10,
    priorityLevel: 1,
    pointsPer1000Vnd: 1.5,
    discountPercent: 5,
  },
  {
    tierName: TierNameEnum.GOLD,
    minVisitsPerMonth: 5,
    bookingWindowDays: 12,
    priorityLevel: 2,
    pointsPer1000Vnd: 2,
    discountPercent: 10,
  },
  {
    tierName: TierNameEnum.PLATINUM,
    minVisitsPerMonth: 10,
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
    for (const tier of DEFAULT_TIERS) {
      await this.repository.upsertByName(tier);
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
