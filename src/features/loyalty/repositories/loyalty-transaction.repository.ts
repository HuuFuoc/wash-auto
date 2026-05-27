import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
} from '../entities/loyalty-transaction.entity';
import { LoyaltyTransactionTypeEnum } from '../types/loyalty-transaction-type.enum';

export interface ICreateLoyaltyTxnInput {
  customerId: Types.ObjectId;
  type: LoyaltyTransactionTypeEnum;
  pointsDelta: number;
  balanceAfter: number;
  orderId?: Types.ObjectId;
  voucherId?: Types.ObjectId;
  previousTierConfigId?: Types.ObjectId;
  newTierConfigId?: Types.ObjectId;
  reason?: string;
}

@Injectable()
export class LoyaltyTransactionRepository {
  constructor(
    @InjectModel(LoyaltyTransaction.name)
    private readonly model: Model<LoyaltyTransactionDocument>,
  ) {}

  async create(
    input: ICreateLoyaltyTxnInput,
  ): Promise<LoyaltyTransactionDocument> {
    return this.model.create({
      customer_id: input.customerId,
      type: input.type,
      points_delta: input.pointsDelta,
      balance_after: input.balanceAfter,
      order_id: input.orderId,
      voucher_id: input.voucherId,
      previous_tier_config_id: input.previousTierConfigId,
      new_tier_config_id: input.newTierConfigId,
      reason: input.reason,
    });
  }

  async findByCustomerPaginated(
    customerId: Types.ObjectId | string,
    page: number,
    limit: number,
  ): Promise<LoyaltyTransactionDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countByCustomer(customerId: Types.ObjectId | string): Promise<number> {
    return this.model
      .countDocuments({ customer_id: new Types.ObjectId(customerId) })
      .exec();
  }
}
