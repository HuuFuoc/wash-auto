import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PricingPolicyDocument = HydratedDocument<PricingPolicy>;

/**
 * Global, admin-managed pricing knobs. There is exactly one document, pinned by
 * the `key` discriminator, so the collection behaves as a singleton.
 */
@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'pricing_policies',
})
export class PricingPolicy {
  // Singleton discriminator — only the 'global' document is ever used.
  @Prop({ required: true, unique: true, default: 'global', index: true })
  key: string;

  // Ceiling for the golden-hour window discount stacked on the tier discount,
  // applied before any voucher. Guards against a misconfigured window driving
  // the price near zero. Admin-tunable; default 50.
  @Prop({ required: true, default: 50, min: 0, max: 100 })
  max_stacked_discount_percent: number;
}

export const PricingPolicySchema = SchemaFactory.createForClass(PricingPolicy);
