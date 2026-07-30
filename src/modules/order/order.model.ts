import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { PaymentMethodEnum } from '../../shared/order/types/payment-method.enum';
import { PaymentStatusEnum } from '../../shared/order/types/payment-status.enum';

// Plain-Mongoose rewrite of features/order/entities/order.entity.ts.
export interface Order {
  customer_id: Types.ObjectId;
  vehicle_id: Types.ObjectId;
  service_type_id: Types.ObjectId;
  staff_shift_id: Types.ObjectId;
  scheduled_at: Date;
  estimated_minutes: number;
  status: OrderStatusEnum;
  priority_level: number;
  reschedule_count: number;
  cancel_reason?: string;
  note?: string;
  payment_method: PaymentMethodEnum;
  payment_status: PaymentStatusEnum;
  amount: number;
  original_amount: number;
  discount_amount: number;
  discount_percent: number;
  discount_reason?: string;
  voucher_id?: Types.ObjectId;
  payos_order_code?: number;
  payos_checkout_url?: string;
  payos_payment_link_id?: string;

  /**
   * `<vehicle_id>@<scheduled_at epoch ms>` while the order is active, unset the
   * moment it reaches a terminal status. A unique sparse index on this column is
   * what physically stops one car being booked into the very same slot twice —
   * the service-level overlap check reads before it writes, so two concurrent
   * bookings (a double-submitted form) can both pass it; this one cannot.
   *
   * A partial index on `status` would depend on server-version support for `$in`
   * inside partialFilterExpression, whereas unique+sparse works everywhere —
   * same trade-off as `voucher_redemptions.active_voucher_id`.
   *
   * It only catches the identical-timestamp collision. Partial overlaps (10:00
   * for 30 min vs 10:15) are the service check's job, which is why both exist.
   */
  active_slot_key?: string;
}

/** The value `active_slot_key` carries while an order holds its slot. */
export function buildActiveSlotKey(
  vehicleId: Types.ObjectId,
  scheduledAt: Date,
): string {
  return `${vehicleId.toString()}@${scheduledAt.getTime()}`;
}

export type OrderDocument = HydratedDocument<Order>;

const orderSchema = new Schema<Order>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    service_type_id: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceType',
      required: true,
      index: true,
    },
    staff_shift_id: {
      type: Schema.Types.ObjectId,
      ref: 'StaffShift',
      required: true,
      index: true,
    },
    scheduled_at: { type: Date, required: true },
    estimated_minutes: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: Object.values(OrderStatusEnum),
      index: true,
    },
    priority_level: { type: Number, required: true, default: 0, min: 0 },
    reschedule_count: { type: Number, required: true, default: 0, min: 0 },
    cancel_reason: { type: String, trim: true },
    note: { type: String, trim: true },
    payment_method: {
      type: String,
      required: true,
      enum: Object.values(PaymentMethodEnum),
    },
    payment_status: {
      type: String,
      required: true,
      enum: Object.values(PaymentStatusEnum),
      default: PaymentStatusEnum.UNPAID,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    original_amount: { type: Number, required: true, min: 0 },
    discount_amount: { type: Number, required: true, default: 0, min: 0 },
    discount_percent: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    discount_reason: { type: String, trim: true },
    voucher_id: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      index: true,
      sparse: true,
    },
    payos_order_code: { type: Number, unique: true, sparse: true, index: true },
    payos_checkout_url: { type: String },
    payos_payment_link_id: { type: String },
    active_slot_key: { type: String, unique: true, sparse: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'orders',
  },
);

orderSchema.index({ customer_id: 1, scheduled_at: -1 });
orderSchema.index({ scheduled_at: 1, status: 1 });
orderSchema.index({ customer_id: 1, status: 1 });
orderSchema.index({ staff_shift_id: 1, status: 1 });
// "Is this car already booked?" — the double-booking guard on create/reschedule.
orderSchema.index({ vehicle_id: 1, status: 1 });

export const OrderModel = model<Order>('Order', orderSchema);
