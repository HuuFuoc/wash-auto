import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentTransactionDocument = HydratedDocument<PaymentTransaction>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'payment_transactions',
})
export class PaymentTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  order_id: Types.ObjectId;

  @Prop({ required: true, index: true })
  order_code: number;

  /** PayOS transaction reference */
  @Prop()
  payos_transaction_id?: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  status: string;

  /** Raw webhook payload stored for audit */
  @Prop({ type: Object })
  raw_data: Record<string, unknown>;

  @Prop()
  transaction_datetime?: Date;
}

export const PaymentTransactionSchema =
  SchemaFactory.createForClass(PaymentTransaction);
