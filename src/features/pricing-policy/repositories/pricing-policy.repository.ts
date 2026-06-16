import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PricingPolicy,
  PricingPolicyDocument,
} from '../entities/pricing-policy.entity';

/** The single key every pricing-policy document is pinned under. */
const SINGLETON_KEY = 'global';

@Injectable()
export class PricingPolicyRepository {
  constructor(
    @InjectModel(PricingPolicy.name)
    private readonly model: Model<PricingPolicyDocument>,
  ) {}

  /** The one policy document, or null before it has been seeded. */
  async findSingleton(): Promise<PricingPolicyDocument | null> {
    return this.model.findOne({ key: SINGLETON_KEY }).exec();
  }

  /** Creates the singleton with schema defaults if it does not exist yet. */
  async ensureSingleton(): Promise<PricingPolicyDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { key: SINGLETON_KEY },
        { $setOnInsert: { key: SINGLETON_KEY } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    if (!doc) throw new Error('Failed to ensure pricing_policy singleton');
    return doc;
  }

  /** Sets the stacked-discount cap on the singleton (upserts if missing). */
  async updateMaxStackedDiscountPercent(
    value: number,
  ): Promise<PricingPolicyDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { key: SINGLETON_KEY },
        { $set: { max_stacked_discount_percent: value } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    if (!doc) throw new Error('Failed to update pricing_policy singleton');
    return doc;
  }
}
