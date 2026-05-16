import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LoyaltyAccountDocument = HydratedDocument<LoyaltyAccount>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'loyalty_accounts',
})
export class LoyaltyAccount {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  customer_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'TierConfig',
    required: true,
    index: true,
  })
  tier_config_id: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  points_balance: number;

  @Prop({ required: true, default: 0, min: 0 })
  visits_this_month: number;

  @Prop({ required: true, default: 0, min: 0 })
  visits_last_month: number;

  @Prop({ required: true, default: 0, min: 0 })
  consecutive_low_months: number;

  @Prop()
  tier_reviewed_at?: Date;

  @Prop()
  points_expire_at?: Date;
}

export const LoyaltyAccountSchema =
  SchemaFactory.createForClass(LoyaltyAccount);
