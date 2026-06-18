import { Types } from 'mongoose';
import { VoucherStatusEnum } from '../../features/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../features/voucher/types/voucher-type.enum';
import { VoucherDocument, VoucherModel } from './voucher.model';

export interface ICreateVoucherInput {
  customerId: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  discountCapVnd: number;
  expiresAt: Date;
}

export class VoucherRepository {
  async create(input: ICreateVoucherInput): Promise<VoucherDocument> {
    return VoucherModel.create({
      customer_id: input.customerId,
      code: input.code,
      type: input.type,
      status: VoucherStatusEnum.UNUSED,
      discount_cap_vnd: input.discountCapVnd,
      expires_at: input.expiresAt,
    });
  }

  async findById(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findById(id).exec();
  }

  /** Lookup by unique voucher code (used to reject duplicate custom codes). */
  async findByCode(code: string): Promise<VoucherDocument | null> {
    return VoucherModel.findOne({ code }).exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOne({
      _id: id,
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  async findByOwner(
    customerId: Types.ObjectId | string,
    status?: VoucherStatusEnum,
  ): Promise<VoucherDocument[]> {
    const filter: Record<string, unknown> = {
      customer_id: new Types.ObjectId(customerId),
    };
    if (status) filter.status = status;
    return VoucherModel.find(filter).sort({ created_at: -1 }).exec();
  }

  async findAllPaginated(
    filter: { status?: VoucherStatusEnum; customerId?: Types.ObjectId },
    page: number,
    limit: number,
  ): Promise<VoucherDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.customerId) query.customer_id = filter.customerId;
    const skip = (page - 1) * limit;
    return VoucherModel.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countAll(filter: {
    status?: VoucherStatusEnum;
    customerId?: Types.ObjectId;
  }): Promise<number> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.customerId) query.customer_id = filter.customerId;
    return VoucherModel.countDocuments(query).exec();
  }

  /**
   * Atomically flips an UNUSED voucher to EXPIRED early (admin revoke).
   * Returns null if the voucher does not exist or is already USED/EXPIRED.
   */
  async revoke(
    id: Types.ObjectId | string,
    reason: string,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOneAndUpdate(
      { _id: id, status: VoucherStatusEnum.UNUSED },
      {
        $set: {
          status: VoucherStatusEnum.EXPIRED,
          granted_reason: `[REVOKED] ${reason}`,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Atomically marks an UNUSED voucher as USED. Returns null if the voucher
   * does not exist, is not owned by the customer, has already been consumed,
   * or has already expired.
   */
  async consume(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOneAndUpdate(
      {
        _id: id,
        customer_id: new Types.ObjectId(customerId),
        status: VoucherStatusEnum.UNUSED,
        expires_at: { $gt: new Date() },
      },
      {
        $set: {
          status: VoucherStatusEnum.USED,
          used_at: new Date(),
          used_order_id: orderId,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /** Restore an UNUSED state - used to refund the voucher on order failure. */
  async refund(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findByIdAndUpdate(
      id,
      {
        $set: { status: VoucherStatusEnum.UNUSED },
        $unset: { used_at: '', used_order_id: '' },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Bulk-flips every UNUSED voucher whose deadline has passed to EXPIRED.
   * Idempotent. Returns the number of affected docs so the cron can log it.
   */
  async expireDueVouchers(now: Date): Promise<number> {
    const result = await VoucherModel.updateMany(
      {
        status: VoucherStatusEnum.UNUSED,
        expires_at: { $lte: now },
      },
      { $set: { status: VoucherStatusEnum.EXPIRED } },
    ).exec();
    return result.modifiedCount ?? 0;
  }
}
