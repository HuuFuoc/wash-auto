import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WashSessionStatusEnum } from '../types/wash-session-status.enum';

export type WashSessionDocument = HydratedDocument<WashSession>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'wash_sessions',
})
export class WashSession {
  // Nullable for walk-in (no prior booking).
  @Prop({ type: Types.ObjectId, ref: 'Booking', index: true })
  booking_id?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  customer_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true,
  })
  vehicle_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ServiceType',
    required: true,
    index: true,
  })
  service_type_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  cashier_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    index: true,
  })
  washer_id?: Types.ObjectId;

  @Prop({ type: Types.Decimal128, required: true })
  service_price_snapshot: Types.Decimal128;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(WashSessionStatusEnum),
    default: WashSessionStatusEnum.WAITING,
    index: true,
  })
  status: WashSessionStatusEnum;

  @Prop()
  started_at?: Date;

  @Prop()
  completed_at?: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  cancel_reason?: string;
}

export const WashSessionSchema = SchemaFactory.createForClass(WashSession);
WashSessionSchema.index({ cashier_id: 1, created_at: -1 });
WashSessionSchema.index({ washer_id: 1, started_at: -1 });
WashSessionSchema.index({ vehicle_id: 1, created_at: -1 });
