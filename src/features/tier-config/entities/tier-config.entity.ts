import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TierNameEnum } from '../types/tier-name.enum';

export type TierConfigDocument = HydratedDocument<TierConfig>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'tier_configs',
})
export class TierConfig {
  @Prop({
    type: String,
    required: true,
    unique: true,
    enum: Object.values(TierNameEnum),
    index: true,
  })
  tier_name: TierNameEnum;

  // Minimum loyalty points required to qualify for this tier.
  // Replaces the old visits-per-month criterion.
  @Prop({ required: true, min: 0 })
  min_loyalty_points: number;

  @Prop({ required: true, min: 0 })
  booking_window_days: number;

  @Prop({ required: true, unique: true, min: 0 })
  priority_level: number;

  // Points earned per 1,000 VND spent on a completed order (tier-scaled bonus).
  @Prop({ required: true, min: 0 })
  points_per_1000_vnd: number;

  // Discount percent applied per wash during golden hours for this tier.
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  discount_percent: number;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const TierConfigSchema = SchemaFactory.createForClass(TierConfig);
