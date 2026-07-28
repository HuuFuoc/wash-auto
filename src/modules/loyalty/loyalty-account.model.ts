import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/loyalty/entities/loyalty-account.entity.ts.
/**
 * Points and progress are deliberately SEPARATE counters with different
 * lifetimes, because the annual reset used to flatten all of them together:
 *
 *   - `points_balance`      tier qualification. Reset each year.
 *   - `lifetime_points`     everything ever earned. Never reset — this is what
 *                           lets the app show "you have earned 4,320 points
 *                           with us" after a reset wiped the balance.
 *   - `*_toward_voucher`    progress to the next reward voucher. NOT tied to the
 *                           calendar, so a customer sitting at 9/10 washes on
 *                           31 December no longer loses that on 1 January.
 *   - `lifetime_spend_vnd`  never reset.
 */
export interface LoyaltyAccount {
  customer_id: Types.ObjectId;
  tier_config_id: Types.ObjectId;
  points_balance: number;
  successful_washes_toward_voucher: number;
  spend_toward_voucher: number;
  total_successful_washes: number;
  last_annual_reset_at?: Date;

  lifetime_points: number;
  lifetime_spend_vnd: number;
  /**
   * Calendar year the last reset ran for. The idempotency guard: a job that
   * fires twice, or a retried HTTP cron call, cannot reset the same account
   * twice in one year.
   */
  last_annual_reset_year?: number;
  /** Total VND this customer has saved through discounts. Never reset. */
  lifetime_saved_vnd: number;
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

    lifetime_points: { type: Number, required: true, default: 0, min: 0 },
    lifetime_spend_vnd: { type: Number, required: true, default: 0, min: 0 },
    last_annual_reset_year: { type: Number },
    lifetime_saved_vnd: { type: Number, required: true, default: 0, min: 0 },
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
