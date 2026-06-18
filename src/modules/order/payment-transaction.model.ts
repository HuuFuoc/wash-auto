import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/order/entities/payment-transaction.entity.ts.
export interface PaymentTransaction {
  order_id: Types.ObjectId;
  order_code: number;
  payos_transaction_id?: string;
  amount: number;
  status: string;
  raw_data: Record<string, unknown>;
  transaction_datetime?: Date;
}

export type PaymentTransactionDocument =
  HydratedDocument<PaymentTransaction>;

const paymentTransactionSchema = new Schema<PaymentTransaction>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    order_code: { type: Number, required: true, index: true },
    // Unique sparse index — DB-level idempotency guard (Redis SETNX is first line).
    payos_transaction_id: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true },
    status: { type: String, required: true },
    raw_data: { type: Object },
    transaction_datetime: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'payment_transactions',
  },
);

export const PaymentTransactionModel = model<PaymentTransaction>(
  'PaymentTransaction',
  paymentTransactionSchema,
);
