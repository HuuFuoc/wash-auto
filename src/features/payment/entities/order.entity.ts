import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'orders',
})
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vehicle', required: true })
  vehicle_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ServiceType', required: true })
  service_type_id: Types.ObjectId;

  /** Unique numeric code sent to PayOS (max 9007199254740991) */
  @Prop({ required: true, unique: true, index: true })
  order_code: number;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, maxlength: 25 })
  description: string;

  @Prop({ enum: OrderStatus, default: OrderStatus.PENDING, index: true })
  status: OrderStatus;

  /** PayOS checkout URL returned after creating the payment link */
  @Prop()
  checkout_url?: string;

  /** PayOS internal payment link ID */
  @Prop()
  payment_link_id?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ customer_id: 1, status: 1 });
OrderSchema.index({ customer_id: 1, created_at: -1 });
