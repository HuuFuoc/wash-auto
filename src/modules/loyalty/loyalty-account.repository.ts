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
  lifetimePoints?: number;
  lifetimeSpendVnd?: number;
  lastAnnualResetYear?: number;
  lifetimeSavedVnd?: number;
}

/** camelCase input key → snake_case column. */
const COLUMN_BY_FIELD: Record<keyof IUpdateLoyaltyAccountInput, string> = {
  tierConfigId: 'tier_config_id',
  pointsBalance: 'points_balance',
  successfulWashesTowardVoucher: 'successful_washes_toward_voucher',
  spendTowardVoucher: 'spend_toward_voucher',
  totalSuccessfulWashes: 'total_successful_washes',
  lastAnnualResetAt: 'last_annual_reset_at',
  lifetimePoints: 'lifetime_points',
  lifetimeSpendVnd: 'lifetime_spend_vnd',
  lastAnnualResetYear: 'last_annual_reset_year',
  lifetimeSavedVnd: 'lifetime_saved_vnd',
};

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
    for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
      const value = input[field as keyof IUpdateLoyaltyAccountInput];
      if (value !== undefined) update[column] = value;
    }

    return LoyaltyAccountModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async findAll(): Promise<LoyaltyAccountDocument[]> {
    return LoyaltyAccountModel.find().exec();
  }

  /**
   * Accounts that have not yet been reset for `year`. The filter IS the
   * idempotency guard: an account already stamped with this year cannot be
   * picked up by a second run, so a retried cron call is a no-op rather than a
   * second wipe.
   */
  async findDueForAnnualReset(
    year: number,
    limit = 500,
  ): Promise<LoyaltyAccountDocument[]> {
    return LoyaltyAccountModel.find({
      $or: [
        { last_annual_reset_year: { $exists: false } },
        { last_annual_reset_year: { $lt: year } },
      ],
    })
      .limit(limit)
      .exec();
  }

  /**
   * Stamps the reset year with a compare-and-set. Two workers racing the same
   * account: only the one whose filter still matches performs the reset.
   */
  async claimForAnnualReset(
    id: Types.ObjectId,
    year: number,
  ): Promise<boolean> {
    const res = await LoyaltyAccountModel.updateOne(
      {
        _id: id,
        $or: [
          { last_annual_reset_year: { $exists: false } },
          { last_annual_reset_year: { $lt: year } },
        ],
      },
      { $set: { last_annual_reset_year: year } },
    ).exec();
    return (res.modifiedCount ?? 0) > 0;
  }

  /** Adds to the running total of what discounts have saved this customer. */
  async addSavedVnd(
    customerId: Types.ObjectId | string,
    savedVnd: number,
  ): Promise<void> {
    if (savedVnd <= 0) return;
    await LoyaltyAccountModel.updateOne(
      { customer_id: new Types.ObjectId(customerId) },
      { $inc: { lifetime_saved_vnd: savedVnd } },
    ).exec();
  }
}
