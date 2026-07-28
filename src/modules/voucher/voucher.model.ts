import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';

// Plain-Mongoose rewrite of features/voucher/entities/voucher.entity.ts.
// customer_id is OPTIONAL: bulk-created "pool" vouchers have no owner until a
// customer claims one by code (sets customer_id). Granted vouchers set it up front.
//
// Every field added after `used_order_id` is nullable on purpose: rows written
// before the campaign refactor have none of them, and the API must keep serving
// those unchanged until the backfill migration runs.
export interface Voucher {
  /**
   * Campaign this voucher was minted under — the source of every eligibility
   * rule applied to it. Nullable until the backfill migration has run over the
   * pre-campaign rows; new vouchers always set it.
   */
  campaign_id?: Types.ObjectId;
  customer_id?: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  status: VoucherStatusEnum;
  discount_cap_vnd: number;
  expires_at: Date;
  granted_reason?: string;
  used_at?: Date;
  used_order_id?: Types.ObjectId;

  // ─── grant audit ───────────────────────────────────────────────────────────
  /** Acquisition channel. Absent on rows minted before this field existed. */
  granted_source?: VoucherSourceEnum;
  /** When the voucher was minted. `created_at` for pool rows claimed later. */
  granted_at?: Date;

  // ─── reservation (held for one in-flight order) ────────────────────────────
  reserved_order_id?: Types.ObjectId;
  reserved_at?: Date;
  /** Sweep releases the hold once this passes. Null whenever status !== RESERVED. */
  reserved_until?: Date;

  // ─── revoke audit ──────────────────────────────────────────────────────────
  revoked_at?: Date;
  /** Admin/manager user id that pulled the trigger. */
  revoked_by?: Types.ObjectId;
  revoke_reason?: string;
}

export type VoucherDocument = HydratedDocument<Voucher>;

const voucherSchema = new Schema<Voucher>(
  {
    campaign_id: {
      type: Schema.Types.ObjectId,
      ref: 'VoucherCampaign',
      index: true,
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    code: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(VoucherTypeEnum),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VoucherStatusEnum),
      default: VoucherStatusEnum.UNUSED,
      index: true,
    },
    discount_cap_vnd: { type: Number, required: true, min: 0 },
    expires_at: { type: Date, required: true, index: true },
    granted_reason: { type: String, trim: true },
    used_at: { type: Date },
    used_order_id: { type: Schema.Types.ObjectId, ref: 'Order' },

    granted_source: {
      type: String,
      enum: Object.values(VoucherSourceEnum),
      index: true,
    },
    granted_at: { type: Date },

    reserved_order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      sparse: true,
    },
    reserved_at: { type: Date },
    reserved_until: { type: Date },

    revoked_at: { type: Date },
    revoked_by: { type: Schema.Types.ObjectId, ref: 'User' },
    revoke_reason: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'vouchers',
  },
);

voucherSchema.index({ customer_id: 1, status: 1 });
// Per-customer usage limits: "how many from this campaign does she already hold?"
voucherSchema.index({ campaign_id: 1, customer_id: 1 });
// Drives the reservation sweep: {status: RESERVED, reserved_until: {$lte: now}}.
voucherSchema.index({ status: 1, reserved_until: 1 });
// "Which voucher paid for this order?" — reconciliation + admin order view.
voucherSchema.index({ used_order_id: 1 }, { sparse: true });

export const VoucherModel = model<Voucher>('Voucher', voucherSchema);
