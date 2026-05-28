import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VoucherTypeEnum } from '../../voucher/types/voucher-type.enum';
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

  /**
   * Voucher type minted when a customer at this tier completes the
   * `WASHES_PER_FREE_VOUCHER` milestone. Null/undefined means the tier
   * does not produce a milestone voucher (e.g. NONE — must climb first).
   */
  @Prop({
    type: String,
    enum: Object.values(VoucherTypeEnum),
    required: false,
  })
  voucher_type_on_milestone?: VoucherTypeEnum;

  /**
   * Discount cap (in VND) baked into the voucher minted at the milestone.
   * 0 / missing means do not mint. Stored here — not derived from
   * `discount_percent` — so admins can tune voucher value independently
   * from the golden-hour discount knob.
   */
  @Prop({ required: true, default: 0, min: 0 })
  voucher_cap_vnd: number;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const TierConfigSchema = SchemaFactory.createForClass(TierConfig);
