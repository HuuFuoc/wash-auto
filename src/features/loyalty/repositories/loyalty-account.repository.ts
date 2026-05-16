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
      visits_this_month: 0,
      visits_last_month: 0,
      consecutive_low_months: 0,
    });
  }
}
