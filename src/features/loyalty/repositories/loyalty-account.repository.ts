import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LoyaltyAccount,
  LoyaltyAccountDocument,
} from '../entities/loyalty-account.entity';

export interface ICreateLoyaltyAccountInput {
  customerId: Types.ObjectId;
  tierConfigId: Types.ObjectId;
}

export interface IUpdateLoyaltyAccountInput {
  tierConfigId?: Types.ObjectId;
  pointsBalance?: number;
  successfulWashesTowardVoucher?: number;
  totalSuccessfulWashes?: number;
  lastAnnualResetAt?: Date;
}

@Injectable()
export class LoyaltyAccountRepository {
  constructor(
    @InjectModel(LoyaltyAccount.name)
    private readonly model: Model<LoyaltyAccountDocument>,
  ) {}

  async findByCustomerId(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument | null> {
    return this.model
      .findOne({ customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async existsByCustomerId(
    customerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.model
      .exists({ customer_id: new Types.ObjectId(customerId) })
      .exec();
    return found !== null;
  }

  async create(
    input: ICreateLoyaltyAccountInput,
  ): Promise<LoyaltyAccountDocument> {
    return this.model.create({
      customer_id: input.customerId,
      tier_config_id: input.tierConfigId,
      points_balance: 0,
      successful_washes_toward_voucher: 0,
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
    if (input.totalSuccessfulWashes !== undefined)
      update.total_successful_washes = input.totalSuccessfulWashes;
    if (input.lastAnnualResetAt !== undefined)
      update.last_annual_reset_at = input.lastAnnualResetAt;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async findAll(): Promise<LoyaltyAccountDocument[]> {
    return this.model.find().exec();
  }
}
