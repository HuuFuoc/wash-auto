import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions';
import { SetTierConfigStatusDto } from '../../shared/tier-config/dto/set-tier-config-status.dto';
import { TierConfigResponseDto } from '../../shared/tier-config/dto/tier-config-response.dto';
import { UpdateTierConfigDto } from '../../shared/tier-config/dto/update-tier-config.dto';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';
import {
  IUpsertTierInput,
  TierConfigRepository,
} from './tier-config.repository';

type IDefaultTier = IUpsertTierInput;

// 4-tier loyalty ladder driven by accumulated loyalty points.
//   None   - <   200  điểm,  2% giảm
//   Bronze - >=  200  điểm,  5% giảm
//   Silver - >=  500  điểm,  8% giảm
//   Gold   - >= 1500  điểm, 10% giảm
//
// Tier discount only applies when the booking falls inside a configured
// golden hour (see GoldenHourService). See the original Nest service for the
// full product-decision history behind these numbers.
//
// The voucher-economics fields below used to be one hardcoded set of constants
// shared by every tier, which meant a Gold customer's reward was identical to a
// brand-new customer's — climbing the ladder bought nothing. They now differ by
// tier: fewer washes per reward, a bigger multiplier, a longer expiry and a
// birthday gift as you climb. Seeds only apply to tiers that do not exist yet;
// an operator's edits are never overwritten.
const DEFAULT_TIERS: IDefaultTier[] = [
  {
    tierName: TierNameEnum.NONE,
    minLoyaltyPoints: 0,
    bookingWindowDays: 7,
    priorityLevel: 0,
    pointsPer1000Vnd: 1,
    discountPercent: 2,
    washesPerRewardVoucher: 10,
    voucherRewardRatePercent: 5,
    voucherRewardMultiplier: 1,
    voucherRewardFloorVnd: 20_000,
    voucherRewardCeilVnd: 100_000,
    minimumValidWashVnd: 40_000,
    voucherExpiryDays: 90,
    birthdayVoucherVnd: 0,
    exclusiveCampaignAccess: false,
  },
  {
    tierName: TierNameEnum.BRONZE,
    minLoyaltyPoints: 200,
    bookingWindowDays: 10,
    priorityLevel: 1,
    pointsPer1000Vnd: 1.5,
    discountPercent: 5,
    washesPerRewardVoucher: 10,
    voucherRewardRatePercent: 5,
    voucherRewardMultiplier: 1.1,
    voucherRewardFloorVnd: 20_000,
    voucherRewardCeilVnd: 100_000,
    minimumValidWashVnd: 40_000,
    voucherExpiryDays: 90,
    birthdayVoucherVnd: 30_000,
    exclusiveCampaignAccess: false,
  },
  {
    tierName: TierNameEnum.SILVER,
    minLoyaltyPoints: 500,
    bookingWindowDays: 12,
    priorityLevel: 2,
    pointsPer1000Vnd: 2,
    discountPercent: 8,
    washesPerRewardVoucher: 9,
    voucherRewardRatePercent: 5,
    voucherRewardMultiplier: 1.25,
    voucherRewardFloorVnd: 25_000,
    voucherRewardCeilVnd: 120_000,
    minimumValidWashVnd: 40_000,
    voucherExpiryDays: 120,
    birthdayVoucherVnd: 50_000,
    exclusiveCampaignAccess: true,
  },
  {
    tierName: TierNameEnum.GOLD,
    minLoyaltyPoints: 1500,
    bookingWindowDays: 14,
    priorityLevel: 3,
    pointsPer1000Vnd: 3,
    discountPercent: 10,
    washesPerRewardVoucher: 8,
    voucherRewardRatePercent: 5,
    voucherRewardMultiplier: 1.5,
    voucherRewardFloorVnd: 30_000,
    voucherRewardCeilVnd: 150_000,
    minimumValidWashVnd: 40_000,
    voucherExpiryDays: 180,
    birthdayVoucherVnd: 100_000,
    exclusiveCampaignAccess: true,
  },
];

// Business logic copied verbatim from
// features/tier-config/tier-config.service.ts; only DI + Nest exceptions +
// Logger were swapped out.
export class TierConfigService {
  constructor(private readonly repository: TierConfigRepository) {}

  /**
   * Ensures the four canonical tiers exist, WITHOUT overwriting anything an
   * operator has configured.
   *
   * This used to compare every stored value against DEFAULT_TIERS and, on any
   * difference, drop the whole collection and reseed. That treated an admin
   * edit as corruption: changing Gold's discount through
   * `PATCH /admin/tier-configs/:id` survived only until the next restart. The
   * fix is to detect a genuinely LEGACY SHAPE (a tier name that no longer
   * exists, or a row predating `min_loyalty_points`) rather than an unexpected
   * value, and to repair narrowly instead of wiping.
   *
   * `upsertByName` writes with `$setOnInsert`, so an existing row is never
   * touched — seeding is purely additive.
   */
  async seedDefaults(): Promise<void> {
    const canonicalNames = DEFAULT_TIERS.map((t) => t.tierName);

    // Tiers from the previous model (Member/Platinum). They also hold the
    // priority_level values that would otherwise clash on the unique index when
    // the canonical rows are inserted, so they go first.
    const droppedLegacy =
      await this.repository.deleteByNamesNotIn(canonicalNames);
    if (droppedLegacy > 0) {
      console.warn(
        `Dropped ${droppedLegacy} tier_configs from the previous tier model`,
      );
    }

    // Rows that predate `min_loyalty_points` cannot be left as-is: the field is
    // required for tier resolution. Only that field is repaired — everything
    // else the operator set is preserved.
    const existing = await this.repository.findAll();
    const seedByName = new Map<string, IDefaultTier>(
      DEFAULT_TIERS.map((t) => [t.tierName, t]),
    );
    for (const doc of existing) {
      if (doc.min_loyalty_points != null) continue;
      const seed = seedByName.get(doc.tier_name);
      if (!seed) continue;
      await this.repository.update(doc._id, {
        minLoyaltyPoints: seed.minLoyaltyPoints,
      });
      console.warn(
        `tier_config ${doc.tier_name} was missing min_loyalty_points - ` +
          `repaired to ${seed.minLoyaltyPoints}`,
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
        console.log(
          `Race on upsert ${tier.tierName} - already inserted by peer`,
        );
      }
    }
    console.log(`Ensured ${DEFAULT_TIERS.length} tier_configs`);
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

    // Judged on the MERGED result: a patch that only raises the floor must be
    // rejected against the stored ceiling, not against nothing.
    const floor =
      dto.voucherRewardFloorVnd ?? existing.voucher_reward_floor_vnd;
    const ceil = dto.voucherRewardCeilVnd ?? existing.voucher_reward_ceil_vnd;
    if (floor > ceil) {
      throw new BadRequestException(
        `voucherRewardFloorVnd (${floor}) không được lớn hơn ` +
          `voucherRewardCeilVnd (${ceil})`,
      );
    }

    const doc = await this.repository.update(id, dto);
    if (!doc) throw new NotFoundException('Tier not found');
    console.log(
      `tier_config updated id=${id} tier=${existing.tier_name} ` +
        `fields=${Object.keys(dto).join(',')}`,
    );
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
