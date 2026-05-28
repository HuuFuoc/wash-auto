import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VoucherStatusEnum } from '../types/voucher-status.enum';
import { VoucherTypeEnum } from '../types/voucher-type.enum';

export type VoucherDocument = HydratedDocument<Voucher>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'vouchers',
})
export class Voucher {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  customer_id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(VoucherTypeEnum),
    index: true,
  })
  type: VoucherTypeEnum;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(VoucherStatusEnum),
    default: VoucherStatusEnum.UNUSED,
    index: true,
  })
  status: VoucherStatusEnum;

  // Max VND knocked off the order when this voucher is redeemed. Caps the
  // free-wash so a customer cannot redeem one minted off Basic washes against
  // a Detailing service and capture more value than the program tolerates.
  @Prop({ required: true, min: 0 })
  discount_cap_vnd: number;

  // Service types the voucher may be redeemed against. Empty array means
  // "any active service". A BRONZE_FREE_BASIC voucher carries exactly one
  // entry — the id of the service flagged `is_default_basic` at mint time.
  // Other tier-aware vouchers leave this empty so they apply broadly.
  @Prop({ type: [Types.ObjectId], ref: 'ServiceType', default: [] })
  applicable_service_type_ids: Types.ObjectId[];

  // Hard deadline. After this instant the daily expire cron flips the voucher
  // to EXPIRED and the consume path also refuses it as a safety net.
  @Prop({ required: true, index: true })
  expires_at: Date;

  @Prop({ trim: true })
  granted_reason?: string;

  @Prop()
  used_at?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  used_order_id?: Types.ObjectId;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);
VoucherSchema.index({ customer_id: 1, status: 1 });
