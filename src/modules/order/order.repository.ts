import { Types } from 'mongoose';
import {
  ACTIVE_ORDER_STATUSES,
  OrderStatusEnum,
} from '../../shared/order/types/order-status.enum';
import { PaymentMethodEnum } from '../../shared/order/types/payment-method.enum';
import { PaymentStatusEnum } from '../../shared/order/types/payment-status.enum';
import { OrderDocument, OrderModel } from './order.model';

export interface ICreateOrderInput {
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceTypeId: Types.ObjectId;
  staffShiftId: Types.ObjectId;
  scheduledAt: Date;
  estimatedMinutes: number;
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
  staffShiftIds?: Types.ObjectId[];
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
  staff_shift_id?: { $in: Types.ObjectId[] };
  status?: OrderStatusEnum | { $in: OrderStatusEnum[] };
  payment_method?: PaymentMethodEnum;
  payment_status?: PaymentStatusEnum;
  scheduled_at?: { $gte?: Date; $lte?: Date };
  created_at?: { $lt: Date };
};

export class OrderRepository {
  async create(input: ICreateOrderInput): Promise<OrderDocument> {
    return OrderModel.create({
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_type_id: input.serviceTypeId,
      staff_shift_id: input.staffShiftId,
      scheduled_at: input.scheduledAt,
      estimated_minutes: input.estimatedMinutes,
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
    return OrderModel.findById(id).exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<OrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return OrderModel.findOne({
      _id: id,
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
  ): Promise<OrderDocument[]> {
    return OrderModel.find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ scheduled_at: -1 })
      .exec();
  }

  async findByPayosOrderCode(orderCode: number): Promise<OrderDocument | null> {
    return OrderModel.findOne({ payos_order_code: orderCode }).exec();
  }

  async countActiveByCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<number> {
    return OrderModel.countDocuments({
      customer_id: new Types.ObjectId(customerId),
      status: { $in: ACTIVE_ORDER_STATUSES },
    }).exec();
  }

  /**
   * Active orders (those still holding a slot) on the given shifts. Used to
   * compute per-time-slot concurrency: one wash per washer at a time.
   */
  async findActiveByShifts(
    shiftIds: Types.ObjectId[],
  ): Promise<OrderDocument[]> {
    if (shiftIds.length === 0) return [];
    return OrderModel.find({
      staff_shift_id: { $in: shiftIds },
      status: { $in: ACTIVE_ORDER_STATUSES },
    })
      .select('staff_shift_id scheduled_at service_type_id')
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

    return OrderModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async applyReschedule(
    id: Types.ObjectId | string,
    staffShiftId: Types.ObjectId,
    scheduledAt: Date,
  ): Promise<OrderDocument | null> {
    return OrderModel.findByIdAndUpdate(
      id,
      {
        $set: { staff_shift_id: staffShiftId, scheduled_at: scheduledAt },
        $inc: { reschedule_count: 1 },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /** Returns up to 100 PENDING_PAYMENT orders created before cutoff. */
  async findExpiredPending(cutoff: Date): Promise<OrderDocument[]> {
    return OrderModel.find({
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
    return OrderModel.find({
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
    return OrderModel.find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer_id', 'name email')
      .populate('vehicle_id', 'license_plate')
      .populate('service_type_id', 'name')
      .exec();
  }

  async countMatching(filter: IOrderListFilter): Promise<number> {
    return OrderModel.countDocuments(this.buildQuery(filter)).exec();
  }

  /**
   * A washer's schedule: bookings sitting on the given (booked-shift) ids,
   * narrowed by the date/status filter, earliest appointment first. Refs
   * populated. Returns [] when no shift ids are supplied.
   */
  async findWasherSchedule(filter: IOrderListFilter): Promise<OrderDocument[]> {
    if (!filter.staffShiftIds || filter.staffShiftIds.length === 0) return [];
    return OrderModel.find(this.buildQuery(filter))
      .sort({ scheduled_at: 1 })
      .populate('customer_id', 'name phone')
      .populate('vehicle_id', 'license_plate')
      .populate('service_type_id', 'name')
      .populate('staff_shift_id', 'station_name')
      .exec();
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
    if (filter.staffShiftIds && filter.staffShiftIds.length > 0) {
      q.staff_shift_id = { $in: filter.staffShiftIds };
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
