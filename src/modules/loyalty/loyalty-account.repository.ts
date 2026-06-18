import { Types } from 'mongoose';
import {
  LoyaltyAccountDocument,
  LoyaltyAccountModel,
} from './loyalty-account.model';

export interface ICreateLoyaltyAccountInput {
  customerId: Types.ObjectId;
  tierConfigId: Types.ObjectId;
}

export interface IUpdateLoyaltyAccountInput {
  tierConfigId?: Types.ObjectId;
  pointsBalance?: number;
  successfulWashesTowardVoucher?: number;
  spendTowardVoucher?: number;
  totalSuccessfulWashes?: number;
  lastAnnualResetAt?: Date;
}

export class LoyaltyAccountRepository {
  async findByCustomerId(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument | null> {
    return LoyaltyAccountModel.findOne({
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  async existsByCustomerId(
    customerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await LoyaltyAccountModel.exists({
      customer_id: new Types.ObjectId(customerId),
    }).exec();
    return found !== null;
  }

  async create(
    input: ICreateLoyaltyAccountInput,
  ): Promise<LoyaltyAccountDocument> {
    return LoyaltyAccountModel.create({
      customer_id: input.customerId,
      tier_config_id: input.tierConfigId,
      points_balance: 0,
      successful_washes_toward_voucher: 0,
      spend_toward_voucher: 0,
      total_successful_washes: 0,
    });
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateLoyaltyAccountInput,
  ): Promise<LoyaltyAccountDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.tierConfigId !== undefined)
      update.tier_config_id = input.tierConfigId;
    if (input.pointsBalance !== undefined)
      update.points_balance = input.pointsBalance;
    if (input.successfulWashesTowardVoucher !== undefined)
      update.successful_washes_toward_voucher =
        input.successfulWashesTowardVoucher;
    if (input.spendTowardVoucher !== undefined)
      update.spend_toward_voucher = input.spendTowardVoucher;
    if (input.totalSuccessfulWashes !== undefined)
      update.total_successful_washes = input.totalSuccessfulWashes;
    if (input.lastAnnualResetAt !== undefined)
      update.last_annual_reset_at = input.lastAnnualResetAt;

    return LoyaltyAccountModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async findAll(): Promise<LoyaltyAccountDocument[]> {
    return LoyaltyAccountModel.find().exec();
  }
}
