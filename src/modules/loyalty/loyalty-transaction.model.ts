import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { LoyaltyTransactionTypeEnum } from '../../features/loyalty/types/loyalty-transaction-type.enum';

// Plain-Mongoose rewrite of
// features/loyalty/entities/loyalty-transaction.entity.ts.
export interface LoyaltyTransaction {
  customer_id: Types.ObjectId;
  type: LoyaltyTransactionTypeEnum;
  points_delta: number;
  balance_after: number;
  order_id?: Types.ObjectId;
  voucher_id?: Types.ObjectId;
  previous_tier_config_id?: Types.ObjectId;
  new_tier_config_id?: Types.ObjectId;
  reason?: string;
}

export type LoyaltyTransactionDocument = HydratedDocument<LoyaltyTransaction>;

const loyaltyTransactionSchema = new Schema<LoyaltyTransaction>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(LoyaltyTransactionTypeEnum),
      index: true,
    },
    points_delta: { type: Number, required: true, default: 0 },
    balance_after: { type: Number, required: true, min: 0 },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    voucher_id: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    previous_tier_config_id: { type: Schema.Types.ObjectId, ref: 'TierConfig' },
    new_tier_config_id: { type: Schema.Types.ObjectId, ref: 'TierConfig' },
    reason: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'loyalty_transactions',
  },
);

loyaltyTransactionSchema.index({ customer_id: 1, created_at: -1 });

export const LoyaltyTransactionModel = model<LoyaltyTransaction>(
  'LoyaltyTransaction',
  loyaltyTransactionSchema,
);
