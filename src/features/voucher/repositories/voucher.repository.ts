import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Voucher, VoucherDocument } from '../entities/voucher.entity';
import { VoucherStatusEnum } from '../types/voucher-status.enum';
import { VoucherTypeEnum } from '../types/voucher-type.enum';

export interface ICreateVoucherInput {
  customerId: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  expiresAt?: Date;
  grantedReason?: string;
}

@Injectable()
export class VoucherRepository {
  constructor(
    @InjectModel(Voucher.name)
    private readonly model: Model<VoucherDocument>,
  ) {}

  async create(input: ICreateVoucherInput): Promise<VoucherDocument> {
    return this.model.create({
      customer_id: input.customerId,
      code: input.code,
      type: input.type,
      status: VoucherStatusEnum.UNUSED,
      expires_at: input.expiresAt,
      granted_reason: input.grantedReason,
    });
  }

  async findById(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
    status?: VoucherStatusEnum,
  ): Promise<VoucherDocument[]> {
    const filter: Record<string, unknown> = {
      customer_id: new Types.ObjectId(customerId),
    };
    if (status) filter.status = status;
    return this.model.find(filter).sort({ created_at: -1 }).exec();
  }

  /**
   * Atomically marks an UNUSED voucher as USED. Returns null if the voucher
   * does not exist, is not owned by the customer, or has already been
   * consumed — callers MUST treat null as "voucher unavailable" and refuse
   * the booking, otherwise a race could double-apply the free wash.
   */
  async consume(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          customer_id: new Types.ObjectId(customerId),
          status: VoucherStatusEnum.UNUSED,
        },
        {
          $set: {
            status: VoucherStatusEnum.USED,
            used_at: new Date(),
            used_order_id: orderId,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /** Restore an UNUSED state — used to refund the voucher on order failure. */
  async refund(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findByIdAndUpdate(
        id,
        {
          $set: { status: VoucherStatusEnum.UNUSED },
          $unset: { used_at: '', used_order_id: '' },
        },
        { returnDocument: 'after' },
      )
      .exec();
  }
}
