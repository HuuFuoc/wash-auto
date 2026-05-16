import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../entities/order.entity';

export interface ICreateOrderInput {
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceTypeId: Types.ObjectId;
  orderCode: number;
  amount: number;
  description: string;
  notes?: string;
}

export interface IUpdateOrderInput {
  status?: OrderStatus;
  checkoutUrl?: string;
  paymentLinkId?: string;
}

export interface IOrderListFilter {
  customerId?: Types.ObjectId;
  status?: OrderStatus;
}

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
      order_code: input.orderCode,
      amount: input.amount,
      description: input.description,
      notes: input.notes,
    });
  }

  async findById(id: Types.ObjectId | string): Promise<OrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByOrderCode(orderCode: number): Promise<OrderDocument | null> {
    return this.model.findOne({ order_code: orderCode }).exec();
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

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateOrderInput,
  ): Promise<OrderDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.checkoutUrl !== undefined) update.checkout_url = input.checkoutUrl;
    if (input.paymentLinkId !== undefined)
      update.payment_link_id = input.paymentLinkId;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
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
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IOrderListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  private buildQuery(filter: IOrderListFilter) {
    const q: Record<string, unknown> = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.status) q.status = filter.status;
    return q;
  }
}
