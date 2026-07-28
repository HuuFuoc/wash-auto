import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { RedemptionStatusEnum } from '../../shared/voucher/types/redemption-status.enum';

/**
 * One attempt to spend one voucher on one order, with the price breakdown
 * frozen at the moment it was priced.
 *
 * This is the audit trail campaign budgets are reconciled against: the cached
 * `redeemed_vnd` counter on the campaign exists for speed, but these rows are
 * the source of truth, so a drifted counter can always be recomputed.
 *
 * Storing the whole breakdown (not just the voucher's share) is deliberate —
 * it snapshots what the customer was actually charged. Re-pricing a historical
 * order under today's campaign rules would rewrite history.
 */
export interface VoucherRedemption {
  voucher_id: Types.ObjectId;
  campaign_id?: Types.ObjectId;
  customer_id: Types.ObjectId;
  order_id: Types.ObjectId;
  status: RedemptionStatusEnum;

  /**
   * Mirrors `voucher_id` while the redemption is RESERVED or APPLIED, and is
   * unset the moment it is RELEASED or CANCELLED. A unique sparse index on this
   * column is what physically prevents one voucher having two live redemptions;
   * a partial index on `status` would depend on server-version support for
   * `$in` inside partialFilterExpression, whereas this works everywhere.
   */
  active_voucher_id?: Types.ObjectId;

  // ─── frozen price breakdown, all integer VND ───────────────────────────────
  original_order_vnd: number;
  eligible_amount_vnd: number;
  promotion_discount_vnd: number;
  tier_discount_vnd: number;
  voucher_discount_vnd: number;
  final_order_vnd: number;

  reserved_until?: Date;
  applied_at?: Date;
  released_at?: Date;
}

export type VoucherRedemptionDocument = HydratedDocument<VoucherRedemption>;

const voucherRedemptionSchema = new Schema<VoucherRedemption>(
  {
    voucher_id: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      required: true,
      index: true,
    },
    campaign_id: {
      type: Schema.Types.ObjectId,
      ref: 'VoucherCampaign',
      index: true,
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(RedemptionStatusEnum),
      index: true,
    },
    active_voucher_id: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      unique: true,
      sparse: true,
    },

    original_order_vnd: { type: Number, required: true, min: 0 },
    eligible_amount_vnd: { type: Number, required: true, min: 0 },
    promotion_discount_vnd: { type: Number, required: true, min: 0 },
    tier_discount_vnd: { type: Number, required: true, min: 0 },
    voucher_discount_vnd: { type: Number, required: true, min: 0 },
    final_order_vnd: { type: Number, required: true, min: 0 },

    reserved_until: { type: Date },
    applied_at: { type: Date },
    released_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'voucher_redemptions',
  },
);

// Drives the reservation sweep.
voucherRedemptionSchema.index({ status: 1, reserved_until: 1 });
// "What did this order actually spend?" — order view + release paths.
voucherRedemptionSchema.index({ order_id: 1, status: 1 });
// Campaign budget reconciliation.
voucherRedemptionSchema.index({ campaign_id: 1, status: 1 });

export const VoucherRedemptionModel = model<VoucherRedemption>(
  'VoucherRedemption',
  voucherRedemptionSchema,
);
