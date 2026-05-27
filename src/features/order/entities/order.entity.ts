import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrderStatusEnum } from '../types/order-status.enum';
import { PaymentMethodEnum } from '../types/payment-method.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';

export type OrderDocument = HydratedDocument<Order>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'orders',
})
export class Order {
  // --- relationships ---

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true,
  })
  vehicle_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ServiceType',
    required: true,
    index: true,
  })
  service_type_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'StaffShift',
    required: true,
    index: true,
  })
  staff_shift_id: Types.ObjectId;

  // --- scheduling ---

  @Prop({ required: true })
  scheduled_at: Date;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(OrderStatusEnum),
    index: true,
  })
  status: OrderStatusEnum;

  @Prop({ required: true, default: 0, min: 0 })
  priority_level: number;

  @Prop({ required: true, default: 0, min: 0 })
  reschedule_count: number;

  @Prop({ trim: true })
  cancel_reason?: string;

  @Prop({ trim: true })
  note?: string;

  // --- payment ---

  @Prop({
    type: String,
    required: true,
    enum: Object.values(PaymentMethodEnum),
  })
  payment_method: PaymentMethodEnum;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(PaymentStatusEnum),
    default: PaymentStatusEnum.UNPAID,
    index: true,
  })
  payment_status: PaymentStatusEnum;

  @Prop({ required: true, min: 0 })
  amount: number;

  /** Service base price before any discount or voucher was applied. */
  @Prop({ required: true, min: 0 })
  original_amount: number;

  /** Total VND knocked off `original_amount` (golden hour + voucher). */
  @Prop({ required: true, default: 0, min: 0 })
  discount_amount: number;

  /** Percent applied during golden hour for this customer's tier (0–100). */
  @Prop({ required: true, default: 0, min: 0, max: 100 })
  discount_percent: number;

  /** Human-readable reason for the discount, eg `golden_hour:Bronze`. */
  @Prop({ trim: true })
  discount_reason?: string;

  /** FREE_WASH voucher consumed on this order, if any. */
  @Prop({ type: Types.ObjectId, ref: 'Voucher', index: true, sparse: true })
  voucher_id?: Types.ObjectId;

  /** Unique numeric code sent to PayOS (online only). */
  @Prop({ unique: true, sparse: true, index: true })
  payos_order_code?: number;

  @Prop()
  payos_checkout_url?: string;

  @Prop()
  payos_payment_link_id?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ customer_id: 1, scheduled_at: -1 });
OrderSchema.index({ scheduled_at: 1, status: 1 });
OrderSchema.index({ customer_id: 1, status: 1 });
