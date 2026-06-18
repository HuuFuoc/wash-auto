import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/loyalty/entities/loyalty-account.entity.ts.
export interface LoyaltyAccount {
  customer_id: Types.ObjectId;
  tier_config_id: Types.ObjectId;
  points_balance: number;
  successful_washes_toward_voucher: number;
  spend_toward_voucher: number;
  total_successful_washes: number;
  last_annual_reset_at?: Date;
}

export type LoyaltyAccountDocument = HydratedDocument<LoyaltyAccount>;

const loyaltyAccountSchema = new Schema<LoyaltyAccount>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    tier_config_id: {
      type: Schema.Types.ObjectId,
      ref: 'TierConfig',
      required: true,
      index: true,
    },
    points_balance: { type: Number, required: true, default: 0, min: 0 },
    successful_washes_toward_voucher: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    spend_toward_voucher: { type: Number, required: true, default: 0, min: 0 },
    total_successful_washes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    last_annual_reset_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'loyalty_accounts',
  },
);

export const LoyaltyAccountModel = model<LoyaltyAccount>(
  'LoyaltyAccount',
  loyaltyAccountSchema,
);
