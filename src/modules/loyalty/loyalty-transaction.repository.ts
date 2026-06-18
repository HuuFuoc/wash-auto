import { Types } from 'mongoose';
import { LoyaltyTransactionTypeEnum } from '../../features/loyalty/types/loyalty-transaction-type.enum';
import {
  LoyaltyTransactionDocument,
  LoyaltyTransactionModel,
} from './loyalty-transaction.model';

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

export class LoyaltyTransactionRepository {
  async create(
    input: ICreateLoyaltyTxnInput,
  ): Promise<LoyaltyTransactionDocument> {
    return LoyaltyTransactionModel.create({
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
    return LoyaltyTransactionModel.find({
      customer_id: new Types.ObjectId(customerId),
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countByCustomer(customerId: Types.ObjectId | string): Promise<number> {
    return LoyaltyTransactionModel.countDocuments({
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }
}
