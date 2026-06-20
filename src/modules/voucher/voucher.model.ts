import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';

// Plain-Mongoose rewrite of features/voucher/entities/voucher.entity.ts.
// customer_id is OPTIONAL: bulk-created "pool" vouchers have no owner until a
// customer claims one by code (sets customer_id). Granted vouchers set it up front.
export interface Voucher {
  customer_id?: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  status: VoucherStatusEnum;
  discount_cap_vnd: number;
  expires_at: Date;
  granted_reason?: string;
  used_at?: Date;
  used_order_id?: Types.ObjectId;
}

export type VoucherDocument = HydratedDocument<Voucher>;

const voucherSchema = new Schema<Voucher>(
  {
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'vouchers',
  },
);

voucherSchema.index({ customer_id: 1, status: 1 });

export const VoucherModel = model<Voucher>('Voucher', voucherSchema);
