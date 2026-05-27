import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../entities/order.entity';
import {
  ACTIVE_ORDER_STATUSES,
  OrderStatusEnum,
} from '../types/order-status.enum';
import { PaymentMethodEnum } from '../types/payment-method.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';

export interface ICreateOrderInput {
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceTypeId: Types.ObjectId;
  staffShiftId: Types.ObjectId;
  scheduledAt: Date;
  priorityLevel: number;
  paymentMethod: PaymentMethodEnum;
  paymentStatus: PaymentStatusEnum;
  status: OrderStatusEnum;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  discountPercent: number;
  discountReason?: string;
  voucherId?: Types.ObjectId;
  note?: string;
  payosOrderCode?: number;
}

export interface IUpdateOrderInput {
  status?: OrderStatusEnum;
  paymentStatus?: PaymentStatusEnum;
  cancelReason?: string;
  payosCheckoutUrl?: string;
  payosPaymentLinkId?: string;
}

export interface IOrderListFilter {
  customerId?: Types.ObjectId;
  customerIds?: Types.ObjectId[];
  vehicleIds?: Types.ObjectId[];
  status?: OrderStatusEnum;
  paymentMethod?: PaymentMethodEnum;
  paymentStatus?: PaymentStatusEnum;
  scheduledFrom?: Date;
  scheduledTo?: Date;
}

type Query = {
  _id?: Types.ObjectId | string;
  customer_id?: Types.ObjectId | { $in: Types.ObjectId[] };
  vehicle_id?: Types.ObjectId | { $in: Types.ObjectId[] };
  status?: OrderStatusEnum | { $in: OrderStatusEnum[] };
  payment_method?: PaymentMethodEnum;
  payment_status?: PaymentStatusEnum;
  scheduled_at?: { $gte?: Date; $lte?: Date };
  created_at?: { $lt: Date };
};

@Injectable()
export class OrderRepository {
  constructor(
    @InjectModel(Order.name)
    private readonly model: Model<OrderDocument>,
  ) {}

  async create(input: ICreateOrderInput): Promise<OrderDocument> {
    return this.model.create({
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_type_id: input.serviceTypeId,
      staff_shift_id: input.staffShiftId,
      scheduled_at: input.scheduledAt,
      priority_level: input.priorityLevel,
      reschedule_count: 0,
      payment_method: input.paymentMethod,
      payment_status: input.paymentStatus,
      status: input.status,
      amount: input.amount,
      original_amount: input.originalAmount,
      discount_amount: input.discountAmount,
      discount_percent: input.discountPercent,
      discount_reason: input.discountReason,
      voucher_id: input.voucherId,
      note: input.note,
      payos_order_code: input.payosOrderCode,
    });
  }

  async findById(id: Types.ObjectId | string): Promise<OrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<OrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
  ): Promise<OrderDocument[]> {
    return this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ scheduled_at: -1 })
      .exec();
  }

  async findByPayosOrderCode(orderCode: number): Promise<OrderDocument | null> {
    return this.model.findOne({ payos_order_code: orderCode }).exec();
  }

  async countActiveByCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<number> {
    return this.model
      .countDocuments({
        customer_id: new Types.ObjectId(customerId),
        status: { $in: ACTIVE_ORDER_STATUSES },
      })
      .exec();
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateOrderInput,
  ): Promise<OrderDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.paymentStatus !== undefined)
      update.payment_status = input.paymentStatus;
    if (input.cancelReason !== undefined)
      update.cancel_reason = input.cancelReason;
    if (input.payosCheckoutUrl !== undefined)
      update.payos_checkout_url = input.payosCheckoutUrl;
    if (input.payosPaymentLinkId !== undefined)
      update.payos_payment_link_id = input.payosPaymentLinkId;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async applyReschedule(
    id: Types.ObjectId | string,
    staffShiftId: Types.ObjectId,
    scheduledAt: Date,
  ): Promise<OrderDocument | null> {
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

  /** Returns up to 100 PENDING_PAYMENT orders created before cutoff. */
  async findExpiredPending(cutoff: Date): Promise<OrderDocument[]> {
    return this.model
      .find({
        status: OrderStatusEnum.PENDING_PAYMENT,
        created_at: { $lt: cutoff },
      })
      .limit(100)
      .exec();
  }

  /**
   * Returns up to 100 CONFIRMED cash orders whose scheduled time has passed
   * the grace window without payment. These will be flipped to NO_SHOW.
   */
  async findUnconfirmedCashPastDue(cutoff: Date): Promise<OrderDocument[]> {
    return this.model
      .find({
        status: OrderStatusEnum.CONFIRMED,
        payment_method: PaymentMethodEnum.CASH,
        payment_status: PaymentStatusEnum.UNPAID,
        scheduled_at: { $lt: cutoff },
      })
      .limit(100)
      .exec();
  }

  async findPaginated(
    filter: IOrderListFilter,
    page: number,
    limit: number,
  ): Promise<OrderDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ scheduled_at: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IOrderListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  private buildQuery(filter: IOrderListFilter): Query {
    const q: Query = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.customerIds && filter.customerIds.length > 0) {
      q.customer_id = { $in: filter.customerIds };
    }
    if (filter.vehicleIds && filter.vehicleIds.length > 0) {
      q.vehicle_id = { $in: filter.vehicleIds };
    }
    if (filter.status) q.status = filter.status;
    if (filter.paymentMethod) q.payment_method = filter.paymentMethod;
    if (filter.paymentStatus) q.payment_status = filter.paymentStatus;
    if (filter.scheduledFrom || filter.scheduledTo) {
      q.scheduled_at = {};
      if (filter.scheduledFrom) q.scheduled_at.$gte = filter.scheduledFrom;
      if (filter.scheduledTo) q.scheduled_at.$lte = filter.scheduledTo;
    }
    return q;
  }
}
