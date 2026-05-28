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

  /**
   * SCHEDULED shifts whose `start_at` falls in [from, to]. The previous
   * per-shift capacity counter has been removed — the booking flow now
   * resolves capacity by checking time overlap against orders already
   * sitting in the shift (`OrderRepository.findOverlappingInShift`).
   */
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
    return this.model.find(query).sort({ start_at: 1 }).exec();
  }

  /**
   * Returns SCHEDULED shifts that fully contain the wash window
   * [scheduledAt, scheduledAt + durationMinutes]. The caller MUST still
   * check that no existing order in the shift overlaps that window —
   * see OrderRepository.findOverlappingInShift.
   *
   * Sorted by start_at ascending so the load-balancer prefers the
   * earliest-starting shift when several candidates fit the window.
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
   * Returns SCHEDULED shifts whose window overlaps [from, to] at all —
   * including shifts that start before `from` but extend into it. Used to
   * enumerate bookable slots; the caller still checks that the full wash
   * window fits inside each shift AND that no existing order overlaps.
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
