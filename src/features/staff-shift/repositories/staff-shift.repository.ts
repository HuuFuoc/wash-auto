import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StaffShift, StaffShiftDocument } from '../entities/staff-shift.entity';
import { ShiftStatusEnum } from '../types/shift-status.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

type ShiftQuery = {
  staff_id?: Types.ObjectId;
  shift_type?: ShiftTypeEnum;
  status?: ShiftStatusEnum | { $in: ShiftStatusEnum[] };
  start_at?: { $gte?: Date; $lte?: Date };
};

export interface ICreateShiftInput {
  staffId: Types.ObjectId;
  shiftType: ShiftTypeEnum;
  stationName?: string;
  startAt: Date;
  endAt: Date;
  note?: string;
}

export interface IUpdateShiftInput {
  staffId?: Types.ObjectId;
  shiftType?: ShiftTypeEnum;
  stationName?: string;
  startAt?: Date;
  endAt?: Date;
  note?: string;
}

export interface IShiftListFilter {
  staffId?: Types.ObjectId;
  shiftType?: ShiftTypeEnum;
  status?: ShiftStatusEnum;
  startFrom?: Date;
  startTo?: Date;
}

@Injectable()
export class StaffShiftRepository {
  constructor(
    @InjectModel(StaffShift.name)
    private readonly model: Model<StaffShiftDocument>,
  ) {}

  async findAvailableForBooking(
    from: Date,
    to: Date,
    shiftType?: ShiftTypeEnum,
  ): Promise<StaffShiftDocument[]> {
    const query: ShiftQuery = {
      status: ShiftStatusEnum.SCHEDULED,
      start_at: { $gte: from, $lte: to },
    };
    if (shiftType) query.shift_type = shiftType;

    // Capacity is per-time-slot (concurrency 1 per washer), resolved by the
    // caller via wash-window overlap - not a whole-shift counter. So this just
    // lists scheduled shifts in range.
    return this.model.find(query).sort({ start_at: 1 }).exec();
  }

  /**
   * Returns SCHEDULED shifts that fully contain the wash window
   * [scheduledAt, scheduledAt + durationMinutes]. Per-slot concurrency (one
   * wash per washer at a time) is enforced by the caller via overlap. Sorted by
   * start_at ASC so the caller prefers the earliest-starting shift.
   */
  async findShiftsContaining(
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<StaffShiftDocument[]> {
    const finishAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
    return this.model
      .find({
        status: ShiftStatusEnum.SCHEDULED,
        start_at: { $lte: scheduledAt },
        end_at: { $gte: finishAt },
      })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Returns SCHEDULED shifts with spare capacity whose window overlaps
   * [from, to] at all - including shifts that start before `from` but
   * extend into it. Used to enumerate bookable slots; the caller still
   * checks that the full wash window fits inside each shift.
   */
  async findOverlapping(from: Date, to: Date): Promise<StaffShiftDocument[]> {
    return this.model
      .find({
        status: ShiftStatusEnum.SCHEDULED,
        start_at: { $lte: to },
        end_at: { $gte: from },
      })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Non-cancelled shifts for a staff member whose window overlaps
   * [startAt, endAt]. Used to block double-booking the same person into two
   * overlapping shifts. `excludeId` skips the shift being updated.
   */
  async findOverlappingForStaff(
    staffId: Types.ObjectId,
    startAt: Date,
    endAt: Date,
    excludeId?: Types.ObjectId | string,
  ): Promise<StaffShiftDocument[]> {
    const query: Record<string, unknown> = {
      staff_id: staffId,
      status: { $ne: ShiftStatusEnum.CANCELLED },
      start_at: { $lt: endAt },
      end_at: { $gt: startAt },
    };
    if (excludeId) query._id = { $ne: excludeId };
    return this.model.find(query).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<StaffShiftDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findPaginated(
    filter: IShiftListFilter,
    page: number,
    limit: number,
  ): Promise<StaffShiftDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ start_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IShiftListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async create(input: ICreateShiftInput): Promise<StaffShiftDocument> {
    return this.model.create({
      staff_id: input.staffId,
      shift_type: input.shiftType,
      station_name: input.stationName,
      start_at: input.startAt,
      end_at: input.endAt,
      status: ShiftStatusEnum.SCHEDULED,
      note: input.note,
    });
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateShiftInput,
  ): Promise<StaffShiftDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.staffId !== undefined) update.staff_id = input.staffId;
    if (input.shiftType !== undefined) update.shift_type = input.shiftType;
    if (input.stationName !== undefined)
      update.station_name = input.stationName;
    if (input.startAt !== undefined) update.start_at = input.startAt;
    if (input.endAt !== undefined) update.end_at = input.endAt;
    if (input.note !== undefined) update.note = input.note;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async setStatus(
    id: Types.ObjectId | string,
    status: ShiftStatusEnum,
  ): Promise<StaffShiftDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' })
      .exec();
  }

  private buildQuery(filter: IShiftListFilter): ShiftQuery {
    const q: ShiftQuery = {};
    if (filter.staffId) q.staff_id = filter.staffId;
    if (filter.shiftType) q.shift_type = filter.shiftType;
    if (filter.status) q.status = filter.status;
    if (filter.startFrom || filter.startTo) {
      q.start_at = {};
      if (filter.startFrom) q.start_at.$gte = filter.startFrom;
      if (filter.startTo) q.start_at.$lte = filter.startTo;
    }
    return q;
  }
}
