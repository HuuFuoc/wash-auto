import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TierConfig, TierConfigDocument } from '../entities/tier-config.entity';
import { TierNameEnum } from '../types/tier-name.enum';

export interface IUpsertTierInput {
  tierName: TierNameEnum;
  minLoyaltyPoints: number;
  bookingWindowDays: number;
  priorityLevel: number;
  pointsPer1000Vnd: number;
  discountPercent: number;
}

export interface IUpdateTierInput {
  minLoyaltyPoints?: number;
  bookingWindowDays?: number;
  priorityLevel?: number;
  pointsPer1000Vnd?: number;
  discountPercent?: number;
}

@Injectable()
export class TierConfigRepository {
  constructor(
    @InjectModel(TierConfig.name)
    private readonly model: Model<TierConfigDocument>,
  ) {}

  async findActive(): Promise<TierConfigDocument[]> {
    return this.model
      .find({ is_active: true })
      .sort({ priority_level: 1 })
      .exec();
  }

  async findAll(): Promise<TierConfigDocument[]> {
    return this.model.find().sort({ priority_level: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<TierConfigDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByName(tierName: TierNameEnum): Promise<TierConfigDocument | null> {
    return this.model.findOne({ tier_name: tierName }).exec();
  }

  async upsertByName(input: IUpsertTierInput): Promise<TierConfigDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { tier_name: input.tierName },
        {
          $setOnInsert: {
            tier_name: input.tierName,
            min_loyalty_points: input.minLoyaltyPoints,
            booking_window_days: input.bookingWindowDays,
            priority_level: input.priorityLevel,
            points_per_1000_vnd: input.pointsPer1000Vnd,
            discount_percent: input.discountPercent,
            is_active: true,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
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
    const res = await this.model
      .deleteMany({ tier_name: { $nin: keepNames } })
      .exec();
    return res.deletedCount ?? 0;
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateTierInput,
  ): Promise<TierConfigDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.minLoyaltyPoints !== undefined)
      update.min_loyalty_points = input.minLoyaltyPoints;
    if (input.bookingWindowDays !== undefined)
      update.booking_window_days = input.bookingWindowDays;
    if (input.priorityLevel !== undefined)
      update.priority_level = input.priorityLevel;
    if (input.pointsPer1000Vnd !== undefined)
      update.points_per_1000_vnd = input.pointsPer1000Vnd;
    if (input.discountPercent !== undefined)
      update.discount_percent = input.discountPercent;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<TierConfigDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { is_active: isActive } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async existsByPriorityLevelExcept(
    priorityLevel: number,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.model
      .exists({ priority_level: priorityLevel, _id: { $ne: excludeId } })
      .exec();
    return found !== null;
  }
}
