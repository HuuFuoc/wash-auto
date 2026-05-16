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

  @Prop({ required: true, min: 0 })
  points_per_wash: number;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const TierConfigSchema = SchemaFactory.createForClass(TierConfig);
