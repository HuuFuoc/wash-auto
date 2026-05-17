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

  @Prop({ required: true, min: 0 })
  min_visits_per_month: number;

  @Prop({ required: true, min: 0 })
  booking_window_days: number;

  @Prop({ required: true, unique: true, min: 0 })
  priority_level: number;

  // Points earned per 1,000 VND spent (deviation from spec §3.14 which had
  // `points_per_wash` flat-per-wash). Aligned with FE landing-page copy.
  @Prop({ required: true, min: 0 })
  points_per_1000_vnd: number;

  // Discount percent applied per wash for this tier (e.g. Silver=5, Gold=10).
  // New field, not in spec §3.14 — added to match FE pricing card.
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  discount_percent: number;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const TierConfigSchema = SchemaFactory.createForClass(TierConfig);
