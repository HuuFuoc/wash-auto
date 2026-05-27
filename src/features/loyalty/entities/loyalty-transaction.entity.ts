import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LoyaltyTransactionTypeEnum } from '../types/loyalty-transaction-type.enum';

export type LoyaltyTransactionDocument = HydratedDocument<LoyaltyTransaction>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'loyalty_transactions',
})
export class LoyaltyTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(LoyaltyTransactionTypeEnum),
    index: true,
  })
  type: LoyaltyTransactionTypeEnum;

  // Signed delta applied to points_balance (+earn, -deduct, 0 for non-point
  // entries like TIER_CHANGED or VOUCHER_GRANTED).
  @Prop({ required: true, default: 0 })
  points_delta: number;

  @Prop({ required: true, min: 0 })
  balance_after: number;

  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  order_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Voucher' })
  voucher_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TierConfig' })
  previous_tier_config_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TierConfig' })
  new_tier_config_id?: Types.ObjectId;

  @Prop({ trim: true })
  reason?: string;
}

export const LoyaltyTransactionSchema =
  SchemaFactory.createForClass(LoyaltyTransaction);
LoyaltyTransactionSchema.index({ customer_id: 1, created_at: -1 });
