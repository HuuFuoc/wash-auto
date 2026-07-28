import { Types } from 'mongoose';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';
import { TierConfigDocument, TierConfigModel } from './tier-config.model';

/** Voucher-economics knobs, shared by the seed and the admin update paths. */
export interface ITierVoucherEconomics {
  washesPerRewardVoucher: number;
  voucherRewardRatePercent: number;
  voucherRewardMultiplier: number;
  voucherRewardFloorVnd: number;
  voucherRewardCeilVnd: number;
  minimumValidWashVnd: number;
  voucherExpiryDays: number;
  birthdayVoucherVnd: number;
  exclusiveCampaignAccess: boolean;
}

export interface IUpsertTierInput extends ITierVoucherEconomics {
  tierName: TierNameEnum;
  minLoyaltyPoints: number;
  bookingWindowDays: number;
  priorityLevel: number;
  pointsPer1000Vnd: number;
  discountPercent: number;
}

export type IUpdateTierInput = Partial<Omit<IUpsertTierInput, 'tierName'>>;

/** camelCase input key → snake_case column. Drives the partial update. */
const COLUMN_BY_FIELD: Record<keyof IUpdateTierInput, string> = {
  minLoyaltyPoints: 'min_loyalty_points',
  bookingWindowDays: 'booking_window_days',
  priorityLevel: 'priority_level',
  pointsPer1000Vnd: 'points_per_1000_vnd',
  discountPercent: 'discount_percent',
  washesPerRewardVoucher: 'washes_per_reward_voucher',
  voucherRewardRatePercent: 'voucher_reward_rate_percent',
  voucherRewardMultiplier: 'voucher_reward_multiplier',
  voucherRewardFloorVnd: 'voucher_reward_floor_vnd',
  voucherRewardCeilVnd: 'voucher_reward_ceil_vnd',
  minimumValidWashVnd: 'minimum_valid_wash_vnd',
  voucherExpiryDays: 'voucher_expiry_days',
  birthdayVoucherVnd: 'birthday_voucher_vnd',
  exclusiveCampaignAccess: 'exclusive_campaign_access',
};

export class TierConfigRepository {
  async findActive(): Promise<TierConfigDocument[]> {
    return TierConfigModel.find({ is_active: true })
      .sort({ priority_level: 1 })
      .exec();
  }

  async findAll(): Promise<TierConfigDocument[]> {
    return TierConfigModel.find().sort({ priority_level: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<TierConfigDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return TierConfigModel.findById(id).exec();
  }

  async findByName(tierName: TierNameEnum): Promise<TierConfigDocument | null> {
    return TierConfigModel.findOne({ tier_name: tierName }).exec();
  }

  async upsertByName(input: IUpsertTierInput): Promise<TierConfigDocument> {
    const doc = await TierConfigModel.findOneAndUpdate(
      { tier_name: input.tierName },
      {
        // $setOnInsert, never $set: an existing tier row belongs to whoever
        // configured it, and seeding must not overwrite their settings.
        $setOnInsert: {
          tier_name: input.tierName,
          min_loyalty_points: input.minLoyaltyPoints,
          booking_window_days: input.bookingWindowDays,
          priority_level: input.priorityLevel,
          points_per_1000_vnd: input.pointsPer1000Vnd,
          discount_percent: input.discountPercent,
          washes_per_reward_voucher: input.washesPerRewardVoucher,
          voucher_reward_rate_percent: input.voucherRewardRatePercent,
          voucher_reward_multiplier: input.voucherRewardMultiplier,
          voucher_reward_floor_vnd: input.voucherRewardFloorVnd,
          voucher_reward_ceil_vnd: input.voucherRewardCeilVnd,
          minimum_valid_wash_vnd: input.minimumValidWashVnd,
          voucher_expiry_days: input.voucherExpiryDays,
          birthday_voucher_vnd: input.birthdayVoucherVnd,
          exclusive_campaign_access: input.exclusiveCampaignAccess,
          is_active: true,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();
    if (!doc) {
      throw new Error(`Failed to upsert tier_config: ${input.tierName}`);
    }
    return doc;
  }

  /**
   * Removes legacy tier rows whose name is not in the supplied list of
   * canonical names. Used during seed to drop pre-existing MEMBER/PLATINUM
   * documents that no longer belong to the new 4-tier model.
   */
  async deleteByNamesNotIn(keepNames: TierNameEnum[]): Promise<number> {
    const res = await TierConfigModel.deleteMany({
      tier_name: { $nin: keepNames },
    }).exec();
    return res.deletedCount ?? 0;
  }

  /** Drops every tier_config doc. Used when migrating off legacy schema. */
  async deleteAll(): Promise<number> {
    const res = await TierConfigModel.deleteMany({}).exec();
    return res.deletedCount ?? 0;
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateTierInput,
  ): Promise<TierConfigDocument | null> {
    const update: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
      const value = input[field as keyof IUpdateTierInput];
      if (value !== undefined) update[column] = value;
    }

    return TierConfigModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<TierConfigDocument | null> {
    return TierConfigModel.findByIdAndUpdate(
      id,
      { $set: { is_active: isActive } },
      { returnDocument: 'after' },
    ).exec();
  }

  async existsByPriorityLevelExcept(
    priorityLevel: number,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await TierConfigModel.exists({
      priority_level: priorityLevel,
      _id: { $ne: excludeId },
    }).exec();
    return found !== null;
  }
}
