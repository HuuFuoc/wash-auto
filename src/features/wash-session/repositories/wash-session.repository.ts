import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WashSession,
  WashSessionDocument,
} from '../entities/wash-session.entity';
import { WashSessionStatusEnum } from '../types/wash-session-status.enum';

type WashSessionQuery = {
  customer_id?: Types.ObjectId;
  cashier_id?: Types.ObjectId;
  washer_id?: Types.ObjectId;
  booking_id?: Types.ObjectId;
  status?: WashSessionStatusEnum | { $in: WashSessionStatusEnum[] };
  created_at?: { $gte?: Date; $lte?: Date };
};

export interface ICreateWashSessionInput {
  bookingId?: Types.ObjectId;
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceTypeId: Types.ObjectId;
  cashierId: Types.ObjectId;
  servicePriceSnapshot: Types.Decimal128;
  note?: string;
}

export interface IWashSessionListFilter {
  customerId?: Types.ObjectId;
  cashierId?: Types.ObjectId;
  washerId?: Types.ObjectId;
  status?: WashSessionStatusEnum;
  createdFrom?: Date;
  createdTo?: Date;
}

@Injectable()
export class WashSessionRepository {
  constructor(
    @InjectModel(WashSession.name)
    private readonly model: Model<WashSessionDocument>,
  ) {}

  async findById(
    id: Types.ObjectId | string,
  ): Promise<WashSessionDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByBookingId(
    bookingId: Types.ObjectId | string,
  ): Promise<WashSessionDocument | null> {
    return this.model
      .findOne({ booking_id: new Types.ObjectId(bookingId) })
      .exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
  ): Promise<WashSessionDocument[]> {
    return this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<WashSessionDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async findByWasher(
    washerId: Types.ObjectId | string,
    status?: WashSessionStatusEnum,
  ): Promise<WashSessionDocument[]> {
    const query: WashSessionQuery = {
      washer_id: new Types.ObjectId(washerId),
    };
    if (status) query.status = status;
    return this.model.find(query).sort({ created_at: -1 }).exec();
  }

  async findPaginated(
    filter: IWashSessionListFilter,
    page: number,
    limit: number,
  ): Promise<WashSessionDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IWashSessionListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async create(input: ICreateWashSessionInput): Promise<WashSessionDocument> {
    return this.model.create({
      booking_id: input.bookingId,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_type_id: input.serviceTypeId,
      cashier_id: input.cashierId,
      service_price_snapshot: input.servicePriceSnapshot,
      note: input.note,
      status: WashSessionStatusEnum.WAITING,
    });
  }

  async assignWasher(
    id: Types.ObjectId | string,
    washerId: Types.ObjectId,
  ): Promise<WashSessionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            washer_id: washerId,
            status: WashSessionStatusEnum.ASSIGNED,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async recordStart(
    id: Types.ObjectId | string,
  ): Promise<WashSessionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: WashSessionStatusEnum.IN_PROGRESS,
            started_at: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async recordComplete(
    id: Types.ObjectId | string,
  ): Promise<WashSessionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: WashSessionStatusEnum.DONE,
            completed_at: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async cancel(
    id: Types.ObjectId | string,
    reason?: string,
  ): Promise<WashSessionDocument | null> {
    const update: Record<string, unknown> = {
      status: WashSessionStatusEnum.CANCELLED,
    };
    if (reason !== undefined) update.cancel_reason = reason;
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  private buildQuery(filter: IWashSessionListFilter): WashSessionQuery {
    const q: WashSessionQuery = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.cashierId) q.cashier_id = filter.cashierId;
    if (filter.washerId) q.washer_id = filter.washerId;
    if (filter.status) q.status = filter.status;
    if (filter.createdFrom || filter.createdTo) {
      q.created_at = {};
      if (filter.createdFrom) q.created_at.$gte = filter.createdFrom;
      if (filter.createdTo) q.created_at.$lte = filter.createdTo;
    }
    return q;
  }
}
