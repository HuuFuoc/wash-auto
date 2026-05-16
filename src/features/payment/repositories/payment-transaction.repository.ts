import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PaymentTransaction,
  PaymentTransactionDocument,
} from '../entities/payment-transaction.entity';

export interface ICreateTransactionInput {
  orderId: Types.ObjectId;
  orderCode: number;
  amount: number;
  status: string;
  rawData: Record<string, unknown>;
  payosTransactionId?: string;
  transactionDatetime?: Date;
}

@Injectable()
export class PaymentTransactionRepository {
  constructor(
    @InjectModel(PaymentTransaction.name)
    private readonly model: Model<PaymentTransactionDocument>,
  ) {}

  async create(
    input: ICreateTransactionInput,
  ): Promise<PaymentTransactionDocument> {
    return this.model.create({
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
    return this.model
      .find({ order_id: new Types.ObjectId(orderId) })
      .sort({ created_at: -1 })
      .exec();
  }
}
