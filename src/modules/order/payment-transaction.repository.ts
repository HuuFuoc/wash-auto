import { Types } from 'mongoose';
import {
  PaymentTransactionDocument,
  PaymentTransactionModel,
} from './payment-transaction.model';

export interface ICreateTransactionInput {
  orderId: Types.ObjectId;
  orderCode: number;
  amount: number;
  status: string;
  rawData: Record<string, unknown>;
  payosTransactionId?: string;
  transactionDatetime?: Date;
}

export class PaymentTransactionRepository {
  async create(
    input: ICreateTransactionInput,
  ): Promise<PaymentTransactionDocument> {
    return PaymentTransactionModel.create({
      order_id: input.orderId,
      order_code: input.orderCode,
      amount: input.amount,
      status: input.status,
      raw_data: input.rawData,
      payos_transaction_id: input.payosTransactionId,
      transaction_datetime: input.transactionDatetime,
    });
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
  ): Promise<PaymentTransactionDocument[]> {
    return PaymentTransactionModel.find({
      order_id: new Types.ObjectId(orderId),
    })
      .sort({ created_at: -1 })
      .exec();
  }
}
