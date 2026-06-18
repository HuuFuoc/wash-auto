import { HydratedDocument, Schema, model } from 'mongoose';
import { TierNameEnum } from '../../features/tier-config/types/tier-name.enum';

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
    discount_percent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'tier_configs',
  },
);

export const TierConfigModel = model<TierConfig>('TierConfig', tierConfigSchema);
