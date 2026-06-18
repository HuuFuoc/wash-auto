import { HydratedDocument, Schema, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/pricing-policy/entities/pricing-policy.entity.ts. There is exactly
// one document, pinned by `key`, so the collection behaves as a singleton.
export interface PricingPolicy {
  key: string;
  max_stacked_discount_percent: number;
}

export type PricingPolicyDocument = HydratedDocument<PricingPolicy>;

const pricingPolicySchema = new Schema<PricingPolicy>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global',
      index: true,
    },
    max_stacked_discount_percent: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'pricing_policies',
  },
);

export const PricingPolicyModel = model<PricingPolicy>(
  'PricingPolicy',
  pricingPolicySchema,
);
