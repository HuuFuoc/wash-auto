import { HydratedDocument, Schema, model } from 'mongoose';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';

// Plain-Mongoose rewrite of
// features/tier-config/entities/tier-config.entity.ts.
export interface TierConfig {
  tier_name: TierNameEnum;
  min_loyalty_points: number;
  booking_window_days: number;
  priority_level: number;
  points_per_1000_vnd: number;
  discount_percent: number;
  is_active: boolean;

  // ─── voucher economics, per tier ───────────────────────────────────────────
  // These were hardcoded constants in LoyaltyService, which meant marketing
  // needed a deploy to move a threshold — and meant every tier earned exactly
  // the same reward, so climbing the ladder bought nothing extra.
  /** Valid washes needed before a reward voucher is minted. */
  washes_per_reward_voucher: number;
  /** Percent of accumulated spend the reward voucher is worth. */
  voucher_reward_rate_percent: number;
  /** Scales the computed reward. >1 makes a higher tier's voucher worth more. */
  voucher_reward_multiplier: number;
  /** Floor/ceiling clamped around the computed reward, in VND. */
  voucher_reward_floor_vnd: number;
  voucher_reward_ceil_vnd: number;
  /** An order below this does not count toward the wash milestone. */
  minimum_valid_wash_vnd: number;
  /** Days a reward voucher stays redeemable. */
  voucher_expiry_days: number;
  /** Birthday gift for this tier. 0 disables it. */
  birthday_voucher_vnd: number;
  /** Whether this tier may claim from tier-restricted campaigns. */
  exclusive_campaign_access: boolean;
}

export type TierConfigDocument = HydratedDocument<TierConfig>;

const tierConfigSchema = new Schema<TierConfig>(
  {
    tier_name: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(TierNameEnum),
      index: true,
    },
    min_loyalty_points: { type: Number, required: true, min: 0 },
    booking_window_days: { type: Number, required: true, min: 0 },
    priority_level: { type: Number, required: true, unique: true, min: 0 },
    points_per_1000_vnd: { type: Number, required: true, min: 0 },
    discount_percent: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    is_active: { type: Boolean, default: true, index: true },

    // Defaults reproduce the previous hardcoded constants exactly, so an
    // existing database behaves identically until someone deliberately edits a
    // tier.
    washes_per_reward_voucher: {
      type: Number,
      required: true,
      default: 10,
      min: 1,
    },
    voucher_reward_rate_percent: {
      type: Number,
      required: true,
      default: 5,
      min: 0,
      max: 100,
    },
    voucher_reward_multiplier: {
      type: Number,
      required: true,
      default: 1,
      min: 0.1,
    },
    voucher_reward_floor_vnd: {
      type: Number,
      required: true,
      default: 20_000,
      min: 0,
    },
    voucher_reward_ceil_vnd: {
      type: Number,
      required: true,
      default: 100_000,
      min: 1,
    },
    minimum_valid_wash_vnd: {
      type: Number,
      required: true,
      default: 40_000,
      min: 0,
    },
    voucher_expiry_days: {
      type: Number,
      required: true,
      default: 90,
      min: 1,
    },
    birthday_voucher_vnd: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    exclusive_campaign_access: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tier_configs',
  },
);

export const TierConfigModel = model<TierConfig>(
  'TierConfig',
  tierConfigSchema,
);
