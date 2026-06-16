import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GoldenHourConfigDocument = HydratedDocument<GoldenHourConfig>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'golden_hour_configs',
})
export class GoldenHourConfig {
  @Prop({ required: true, trim: true })
  name: string;

  // Days of week this window is active on, 0=Sunday … 6=Saturday.
  // Empty array means "every day".
  @Prop({ type: [Number], default: [], min: 0, max: 6 })
  days_of_week: number[];

  // Local start of the window in minutes since midnight (0..1439).
  @Prop({ required: true, min: 0, max: 1439 })
  start_minute: number;

  // Local end of the window in minutes since midnight (exclusive). Must be
  // strictly greater than start_minute.
  @Prop({ required: true, min: 1, max: 1440 })
  end_minute: number;

  // IANA timezone the start/end minutes are expressed in.
  @Prop({ required: true, default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  // Discount this window contributes, stacked additively on top of the
  // customer's tier discount (capped by the admin-configured pricing policy at
  // pricing time). 0 means the window only gates the tier discount, as
  // before. Default 0 keeps existing windows behaving exactly as they did.
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  discount_percent: number;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const GoldenHourConfigSchema =
  SchemaFactory.createForClass(GoldenHourConfig);
