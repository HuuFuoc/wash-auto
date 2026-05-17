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
