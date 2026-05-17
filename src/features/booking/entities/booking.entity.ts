import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingStatusEnum } from '../types/booking-status.enum';

export type BookingDocument = HydratedDocument<Booking>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'bookings',
})
export class Booking {
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
    ref: 'StaffShift',
    required: true,
    index: true,
  })
  staff_shift_id: Types.ObjectId;

  @Prop({ required: true })
  scheduled_at: Date;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(BookingStatusEnum),
    default: BookingStatusEnum.PENDING,
    index: true,
  })
  status: BookingStatusEnum;

  @Prop({ required: true, default: 0, min: 0 })
  priority_level: number;

  @Prop({ required: true, default: 0, min: 0 })
  reschedule_count: number;

  @Prop({ trim: true })
  cancel_reason?: string;

  // Customer-supplied note for staff (deviation from docs §3.7 — added for UX).
  @Prop({ trim: true })
  note?: string;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
BookingSchema.index({ customer_id: 1, scheduled_at: -1 });
BookingSchema.index({ scheduled_at: 1, status: 1 });
