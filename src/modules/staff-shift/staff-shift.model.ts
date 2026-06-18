import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';

// Plain-Mongoose rewrite of
// features/staff-shift/entities/staff-shift.entity.ts.
export interface StaffShift {
  staff_id: Types.ObjectId;
  shift_type: ShiftTypeEnum;
  station_name?: string;
  start_at: Date;
  end_at: Date;
  status: ShiftStatusEnum;
  note?: string;
}

export type StaffShiftDocument = HydratedDocument<StaffShift>;

const staffShiftSchema = new Schema<StaffShift>(
  {
    staff_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shift_type: {
      type: String,
      required: true,
      enum: Object.values(ShiftTypeEnum),
      index: true,
    },
    station_name: { type: String, trim: true },
    start_at: { type: Date, required: true },
    end_at: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(ShiftStatusEnum),
      default: ShiftStatusEnum.SCHEDULED,
      index: true,
    },
    note: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'staff_shifts',
  },
);

staffShiftSchema.index({ staff_id: 1, start_at: -1 });
staffShiftSchema.index({ shift_type: 1, status: 1 });

export const StaffShiftModel = model<StaffShift>(
  'StaffShift',
  staffShiftSchema,
);
