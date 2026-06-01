import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LoyaltyAccountDocument = HydratedDocument<LoyaltyAccount>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'loyalty_accounts',
})
export class LoyaltyAccount {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  customer_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'TierConfig',
    required: true,
    index: true,
  })
  tier_config_id: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  points_balance: number;

  // Number of VALID COMPLETED washes since the last free-wash voucher was
  // granted. Resets to 0 when the threshold mints a voucher. Only washes that
  // pass the validity rule (eligible service + min spend) are counted.
  @Prop({ required: true, default: 0, min: 0 })
  successful_washes_toward_voucher: number;

  // Sum of money actually paid across the valid washes in the current cycle.
  // The voucher value is computed as a % of this spend (giveaway target), so
  // the reward scales with what the customer really spent. Resets with the
  // wash counter when a voucher is minted.
  @Prop({ required: true, default: 0, min: 0 })
  spend_toward_voucher: number;

  // Lifetime COMPLETED-order counter, never reset by the voucher mint.
  @Prop({ required: true, default: 0, min: 0 })
  total_successful_washes: number;

  // Last time the annual reset cron zeroed this account. Null until first reset.
  @Prop()
  last_annual_reset_at?: Date;
}

export const LoyaltyAccountSchema =
  SchemaFactory.createForClass(LoyaltyAccount);
