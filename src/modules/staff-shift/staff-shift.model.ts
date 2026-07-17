import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';

// Anonymous capacity-based shift: a shift is a bookable time window with a
// concurrent-wash capacity. `staff_id`/`station_name` remain optional for
// legacy per-staff rows created before the simplification.
export interface StaffShift {
  staff_id?: Types.ObjectId;
  shift_type: ShiftTypeEnum;
  station_name?: string;
  capacity: number;
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
      index: true,
    },
    shift_type: {
      type: String,
      required: true,
      enum: Object.values(ShiftTypeEnum),
      default: ShiftTypeEnum.WASHER,
      index: true,
    },
    station_name: { type: String, trim: true },
    capacity: { type: Number, required: true, min: 1, default: 1 },
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

/**
 * Time-derived status: shifts complete themselves when the window ends — no
 * cron, no manual transitions (works on serverless where timers can't run).
 * Only CANCELLED is a real stored decision; the rest follows the clock.
 */
export function effectiveShiftStatus(
  shift: Pick<StaffShift, 'status' | 'start_at' | 'end_at'>,
  now: Date = new Date(),
): ShiftStatusEnum {
  if (shift.status === ShiftStatusEnum.CANCELLED) {
    return ShiftStatusEnum.CANCELLED;
  }
  if (now.getTime() >= shift.end_at.getTime()) {
    return ShiftStatusEnum.COMPLETED;
  }
  if (now.getTime() >= shift.start_at.getTime()) {
    return ShiftStatusEnum.ACTIVE;
  }
  return ShiftStatusEnum.SCHEDULED;
}
