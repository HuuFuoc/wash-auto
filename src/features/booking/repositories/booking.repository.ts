import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingDocument } from '../entities/booking.entity';
import {
  ACTIVE_BOOKING_STATUSES,
  BookingStatusEnum,
} from '../types/booking-status.enum';

type BookingQuery = {
  _id?: Types.ObjectId | string;
  customer_id?: Types.ObjectId | { $in: Types.ObjectId[] };
  vehicle_id?: Types.ObjectId | { $in: Types.ObjectId[] };
  service_type_id?: Types.ObjectId;
  staff_shift_id?: Types.ObjectId;
  status?: BookingStatusEnum | { $in: BookingStatusEnum[] };
  scheduled_at?: { $gte?: Date; $lte?: Date };
};

export interface ICreateBookingInput {
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceTypeId: Types.ObjectId;
  staffShiftId: Types.ObjectId;
  scheduledAt: Date;
  priorityLevel: number;
  note?: string;
}

export interface IBookingListFilter {
  customerId?: Types.ObjectId;
  customerIds?: Types.ObjectId[];
  vehicleIds?: Types.ObjectId[];
  status?: BookingStatusEnum;
  scheduledFrom?: Date;
  scheduledTo?: Date;
}

@Injectable()
export class BookingRepository {
  constructor(
    @InjectModel(Booking.name)
    private readonly model: Model<BookingDocument>,
  ) {}

  async findById(id: Types.ObjectId | string): Promise<BookingDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<BookingDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
  ): Promise<BookingDocument[]> {
    return this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ scheduled_at: -1 })
      .exec();
  }

  async countActiveByCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<number> {
    return this.model
      .countDocuments({
        customer_id: new Types.ObjectId(customerId),
        status: { $in: ACTIVE_BOOKING_STATUSES },
      })
      .exec();
  }

  async findPaginated(
    filter: IBookingListFilter,
    page: number,
    limit: number,
  ): Promise<BookingDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ scheduled_at: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IBookingListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async create(input: ICreateBookingInput): Promise<BookingDocument> {
    return this.model.create({
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_type_id: input.serviceTypeId,
      staff_shift_id: input.staffShiftId,
      scheduled_at: input.scheduledAt,
      status: BookingStatusEnum.PENDING,
      priority_level: input.priorityLevel,
      reschedule_count: 0,
      note: input.note,
    });
  }

  async setStatus(
    id: Types.ObjectId | string,
    status: BookingStatusEnum,
    cancelReason?: string,
  ): Promise<BookingDocument | null> {
    const update: Record<string, unknown> = { status };
    if (cancelReason !== undefined) update.cancel_reason = cancelReason;
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async applyReschedule(
    id: Types.ObjectId | string,
    staffShiftId: Types.ObjectId,
    scheduledAt: Date,
  ): Promise<BookingDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: { staff_shift_id: staffShiftId, scheduled_at: scheduledAt },
          $inc: { reschedule_count: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  private buildQuery(filter: IBookingListFilter): BookingQuery {
    const q: BookingQuery = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.customerIds && filter.customerIds.length > 0) {
      q.customer_id = { $in: filter.customerIds };
    }
    if (filter.vehicleIds && filter.vehicleIds.length > 0) {
      q.vehicle_id = { $in: filter.vehicleIds };
    }
    if (filter.status) q.status = filter.status;
    if (filter.scheduledFrom || filter.scheduledTo) {
      q.scheduled_at = {};
      if (filter.scheduledFrom) q.scheduled_at.$gte = filter.scheduledFrom;
      if (filter.scheduledTo) q.scheduled_at.$lte = filter.scheduledTo;
    }
    return q;
  }
}
