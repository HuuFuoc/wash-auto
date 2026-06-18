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

export class StaffShiftRepository {
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
    return StaffShiftModel.find(query).sort({ start_at: 1 }).exec();
  }

  /**
   * SCHEDULED washer shifts that fully contain the wash window
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
      status: ShiftStatusEnum.SCHEDULED,
      shift_type: ShiftTypeEnum.WASHER,
      start_at: { $lte: scheduledAt },
      end_at: { $gte: finishAt },
      ...(staffIds ? { staff_id: { $in: staffIds } } : {}),
    })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Staff ids of WASHER shifts that cover `now` and are still live (SCHEDULED
   * or ACTIVE). Optionally intersected with `staffIds`.
   */
  async findOnShiftWasherStaffIdsAt(
    now: Date,
    staffIds?: Types.ObjectId[],
  ): Promise<Types.ObjectId[]> {
    if (staffIds && staffIds.length === 0) return [];
    const ids = await StaffShiftModel.distinct('staff_id', {
      shift_type: ShiftTypeEnum.WASHER,
      status: { $in: [ShiftStatusEnum.SCHEDULED, ShiftStatusEnum.ACTIVE] },
      start_at: { $lte: now },
      end_at: { $gte: now },
      ...(staffIds ? { staff_id: { $in: staffIds } } : {}),
    }).exec();
    return ids;
  }

  /**
   * SCHEDULED washer shifts whose window overlaps [from, to] at all - including
   * shifts that start before `from` but extend into it.
   */
  async findOverlapping(
    from: Date,
    to: Date,
    staffIds?: Types.ObjectId[],
  ): Promise<StaffShiftDocument[]> {
    if (staffIds && staffIds.length === 0) return [];
    return StaffShiftModel.find({
      status: ShiftStatusEnum.SCHEDULED,
      shift_type: ShiftTypeEnum.WASHER,
      ...(staffIds ? { staff_id: { $in: staffIds } } : {}),
      start_at: { $lte: to },
      end_at: { $gte: from },
    })
      .sort({ start_at: 1 })
      .exec();
  }

  /**
   * Non-cancelled shifts for a staff member whose window overlaps
   * [startAt, endAt]. `excludeId` skips the shift being updated.
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
    return StaffShiftModel.find(query).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<StaffShiftDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return StaffShiftModel.findById(id).exec();
  }

  /** The `_id`s of every shift this staff member is rostered on. */
  async findShiftIdsByStaff(
    staffId: Types.ObjectId | string,
  ): Promise<Types.ObjectId[]> {
    if (!Types.ObjectId.isValid(staffId)) return [];
    // `_id` is on the hydrated document, not the StaffShift interface, so
    // distinct() infers unknown[] — cast the result back to ObjectId[].
    const ids = await StaffShiftModel.distinct('_id', {
      staff_id: new Types.ObjectId(staffId),
    }).exec();
    return ids as Types.ObjectId[];
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
}
