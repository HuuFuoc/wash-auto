import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ShiftStatusEnum } from '../types/shift-status.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export type StaffShiftDocument = HydratedDocument<StaffShift>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'staff_shifts',
})
export class StaffShift {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  staff_id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ShiftTypeEnum),
    index: true,
  })
  shift_type: ShiftTypeEnum;

  @Prop({ trim: true })
  station_name?: string;

  @Prop({ required: true })
  start_at: Date;

  @Prop({ required: true })
  end_at: Date;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ShiftStatusEnum),
    default: ShiftStatusEnum.SCHEDULED,
    index: true,
  })
  status: ShiftStatusEnum;

  @Prop({ trim: true })
  note?: string;
}

export const StaffShiftSchema = SchemaFactory.createForClass(StaffShift);
StaffShiftSchema.index({ staff_id: 1, start_at: -1 });
StaffShiftSchema.index({ shift_type: 1, status: 1 });
