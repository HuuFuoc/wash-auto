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
  maxBookings: number;
  note?: string;
}

export interface IUpdateShiftInput {
  staffId?: Types.ObjectId;
  shiftType?: ShiftTypeEnum;
  stationName?: string;
  startAt?: Date;
  endAt?: Date;
  maxBookings?: number;
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

    return this.model
      .find({
        ...query,
        $expr: { $lt: ['$current_bookings', '$max_bookings'] },
      })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Returns SCHEDULED shifts that fully contain the wash window
   * [scheduledAt, scheduledAt + durationMinutes] AND still have capacity.
   * Sorted by current_bookings ASC then start_at ASC so the caller
   * load-balances across bays and prefers the earliest-starting shift on ties.
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
        $expr: { $lt: ['$current_bookings', '$max_bookings'] },
      })
      .sort({ current_bookings: 1, start_at: 1 })
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
        $expr: { $lt: ['$current_bookings', '$max_bookings'] },
      })
      .sort({ start_at: 1 })
      .exec();
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
      max_bookings: input.maxBookings,
      current_bookings: 0,
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
    if (input.maxBookings !== undefined)
      update.max_bookings = input.maxBookings;
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

  /**
   * Atomic capacity reservation. Returns the updated doc if the shift
   * still had capacity (current_bookings < max_bookings AND
   * status=scheduled), else null. Use this BEFORE creating the
   * booking document - call decrementCurrentBookings on failure paths.
   */
  async incrementCurrentBookings(
    id: Types.ObjectId | string,
  ): Promise<StaffShiftDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: ShiftStatusEnum.SCHEDULED,
          $expr: { $lt: ['$current_bookings', '$max_bookings'] },
        },
        { $inc: { current_bookings: 1 } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async decrementCurrentBookings(
    id: Types.ObjectId | string,
  ): Promise<StaffShiftDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: id, current_bookings: { $gt: 0 } },
        { $inc: { current_bookings: -1 } },
        { returnDocument: 'after' },
      )
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
