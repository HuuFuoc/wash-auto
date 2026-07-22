import { Types } from 'mongoose';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';
import { StaffShiftDocument, StaffShiftModel } from './staff-shift.model';

type ShiftQuery = {
  staff_id?: Types.ObjectId | { $in: Types.ObjectId[] };
  shift_type?: ShiftTypeEnum;
  status?: ShiftStatusEnum | { $in: ShiftStatusEnum[] };
  start_at?: { $gte?: Date; $lte?: Date };
};

/**
 * Shift statuses a customer can still book against. Stored status is only ever
 * SCHEDULED or CANCELLED now (ACTIVE/COMPLETED are time-derived at read time),
 * but legacy rows may still carry manually-set ACTIVE/COMPLETED values.
 */
const BOOKABLE_SHIFT_STATUSES: ShiftStatusEnum[] = [
  ShiftStatusEnum.SCHEDULED,
  ShiftStatusEnum.ACTIVE,
];

export interface ICreateShiftInput {
  capacity: number;
  startAt: Date;
  endAt: Date;
  note?: string;
}

export interface IUpdateShiftInput {
  capacity?: number;
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

export class StaffShiftRepository {
  async findAvailableForBooking(
    from: Date,
    to: Date,
    shiftType?: ShiftTypeEnum,
  ): Promise<StaffShiftDocument[]> {
    const query: ShiftQuery = {
      status: { $in: BOOKABLE_SHIFT_STATUSES },
      start_at: { $gte: from, $lte: to },
    };
    if (shiftType) query.shift_type = shiftType;
    return StaffShiftModel.find(query).sort({ start_at: 1 }).exec();
  }

  /**
   * Live washer shifts (SCHEDULED or ACTIVE) that fully contain the wash window
   * [scheduledAt, scheduledAt + durationMinutes]. Sorted by start_at ASC.
   */
  async findShiftsContaining(
    scheduledAt: Date,
    durationMinutes: number,
    staffIds?: Types.ObjectId[],
  ): Promise<StaffShiftDocument[]> {
    if (staffIds && staffIds.length === 0) return [];
    const finishAt = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
    return StaffShiftModel.find({
      status: { $in: BOOKABLE_SHIFT_STATUSES },
      shift_type: ShiftTypeEnum.WASHER,
      start_at: { $lte: scheduledAt },
      end_at: { $gte: finishAt },
      ...(staffIds ? { staff_id: { $in: staffIds } } : {}),
    })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Live washer shifts (SCHEDULED or ACTIVE) whose window overlaps [from, to] at
   * all - including shifts that start before `from` but extend into it.
   */
  async findOverlapping(
    from: Date,
    to: Date,
    staffIds?: Types.ObjectId[],
  ): Promise<StaffShiftDocument[]> {
    if (staffIds && staffIds.length === 0) return [];
    return StaffShiftModel.find({
      status: { $in: BOOKABLE_SHIFT_STATUSES },
      shift_type: ShiftTypeEnum.WASHER,
      ...(staffIds ? { staff_id: { $in: staffIds } } : {}),
      start_at: { $lte: to },
      end_at: { $gte: from },
    })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Non-cancelled washer shifts whose window overlaps [startAt, endAt] at all.
   * Anonymous shifts must not overlap each other (capacity is edited instead of
   * stacking shifts); `excludeId` skips the shift being moved.
   */
  async findOverlappingShifts(
    startAt: Date,
    endAt: Date,
    excludeId?: Types.ObjectId | string,
  ): Promise<StaffShiftDocument[]> {
    const query: Record<string, unknown> = {
      shift_type: ShiftTypeEnum.WASHER,
      status: { $ne: ShiftStatusEnum.CANCELLED },
      start_at: { $lt: endAt },
      end_at: { $gt: startAt },
    };
    if (excludeId) query._id = { $ne: excludeId };
    return StaffShiftModel.find(query).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<StaffShiftDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return StaffShiftModel.findById(id).exec();
  }

  async findPaginated(
    filter: IShiftListFilter,
    page: number,
    limit: number,
  ): Promise<StaffShiftDocument[]> {
    const skip = (page - 1) * limit;
    return StaffShiftModel.find(this.buildQuery(filter))
      .sort({ start_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IShiftListFilter): Promise<number> {
    return StaffShiftModel.countDocuments(this.buildQuery(filter)).exec();
  }

  async create(input: ICreateShiftInput): Promise<StaffShiftDocument> {
    return StaffShiftModel.create({
      shift_type: ShiftTypeEnum.WASHER,
      capacity: input.capacity,
      start_at: input.startAt,
      end_at: input.endAt,
      status: ShiftStatusEnum.SCHEDULED,
      note: input.note,
    });
  }

  /** Bulk-insert anonymous washer shifts (used by range/bulk creation). */
  async createMany(inputs: ICreateShiftInput[]): Promise<StaffShiftDocument[]> {
    if (inputs.length === 0) return [];
    return StaffShiftModel.insertMany(
      inputs.map((input) => ({
        shift_type: ShiftTypeEnum.WASHER,
        capacity: input.capacity,
        start_at: input.startAt,
        end_at: input.endAt,
        status: ShiftStatusEnum.SCHEDULED,
        note: input.note,
      })),
    );
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateShiftInput,
  ): Promise<StaffShiftDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.capacity !== undefined) update.capacity = input.capacity;
    if (input.startAt !== undefined) update.start_at = input.startAt;
    if (input.endAt !== undefined) update.end_at = input.endAt;
    if (input.note !== undefined) update.note = input.note;

    return StaffShiftModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async setStatus(
    id: Types.ObjectId | string,
    status: ShiftStatusEnum,
  ): Promise<StaffShiftDocument | null> {
    return StaffShiftModel.findByIdAndUpdate(
      id,
      { $set: { status } },
      { returnDocument: 'after' },
    ).exec();
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

  /** Number of shifts per staff member, optionally within a start_at window. */
  async countShiftsByStaff(
    staffIds: Array<Types.ObjectId | string>,
    from?: Date,
    to?: Date,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (staffIds.length === 0) return result;
    const match: ShiftQuery = {
      staff_id: { $in: staffIds.map((s) => new Types.ObjectId(s)) },
    };
    if (from || to) {
      match.start_at = {};
      if (from) match.start_at.$gte = from;
      if (to) match.start_at.$lte = to;
    }
    const rows = await StaffShiftModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: match },
      { $group: { _id: '$staff_id', count: { $sum: 1 } } },
    ]).exec();
    for (const row of rows) {
      result.set(row._id.toString(), row.count);
    }
    return result;
  }
}
