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

  @Prop()
  expires_at?: Date;

  @Prop({ trim: true })
  granted_reason?: string;

  @Prop()
  used_at?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  used_order_id?: Types.ObjectId;
}

export const VoucherSchema = SchemaFactory.createForClass(Voucher);
VoucherSchema.index({ customer_id: 1, status: 1 });
