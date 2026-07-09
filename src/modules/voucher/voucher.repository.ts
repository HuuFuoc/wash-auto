import { Types } from 'mongoose';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';
import { VoucherDocument, VoucherModel } from './voucher.model';

export interface ICreateVoucherInput {
  customerId: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  discountCapVnd: number;
  expiresAt: Date;
}

/** One pool voucher in a bulk batch (no owner until claimed). */
export interface IBulkVoucherInput {
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

  /** Inserts a batch of unowned pool vouchers (customers claim them by code). */
  async createBulk(inputs: IBulkVoucherInput[]): Promise<VoucherDocument[]> {
    if (inputs.length === 0) return [];
    const docs = inputs.map((i) => ({
      code: i.code,
      type: i.type,
      status: VoucherStatusEnum.UNUSED,
      discount_cap_vnd: i.discountCapVnd,
      expires_at: i.expiresAt,
    }));
    return VoucherModel.insertMany(docs);
  }

  /**
   * Atomically assigns an unclaimed, UNUSED, unexpired pool voucher to a
   * customer. Returns null if the code does not exist, was already claimed,
   * is used, or has expired.
   */
  async claimByCode(
    code: string,
    customerId: Types.ObjectId | string,
  ): Promise<VoucherDocument | null> {
    return VoucherModel.findOneAndUpdate(
      {
        code,
        customer_id: { $exists: false },
        status: VoucherStatusEnum.UNUSED,
        expires_at: { $gt: new Date() },
      },
      { $set: { customer_id: new Types.ObjectId(customerId) } },
      { returnDocument: 'after' },
    ).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findById(id).exec();
  }

  /** Lookup by unique voucher code (used to reject duplicate custom codes). */
  async findByCode(code: string): Promise<VoucherDocument | null> {
    return VoucherModel.findOne({ code }).exec();
  }

  /**
   * True nếu khách đã sở hữu 1 voucher thuộc cùng lô (batchKey =
   * PREFIX-YYYYMMDD). Dùng để chặn nhận >1 voucher mỗi đợt phát hành.
   */
  async existsInBatchForCustomer(
    batchKey: string,
    customerId: Types.ObjectId | string,
  ): Promise<boolean> {
    // Mã trong lô: `${batchKey}-NNNN` (4 chữ số). Escape ký tự regex an toàn.
    const escaped = batchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await VoucherModel.exists({
      customer_id: new Types.ObjectId(customerId),
      code: { $regex: new RegExp(`^${escaped}-\\d{4}$`) },
    }).exec();
    return !!found;
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
   * Thống kê tổng TOÀN BỘ voucher (gồm cả cấp đích danh lẫn lô pool).
   * 4 nhóm loại trừ nhau (used → expired → claimed → inPool) cộng lại = total.
   */
  async aggregateStats(): Promise<{
    total: number;
    used: number;
    expired: number;
    claimed: number;
    inPool: number;
  }> {
    const [row] = await VoucherModel.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          used: {
            $sum: {
              $cond: [{ $eq: ['$status', VoucherStatusEnum.USED] }, 1, 0],
            },
          },
          expired: {
            $sum: {
              $cond: [{ $eq: ['$status', VoucherStatusEnum.EXPIRED] }, 1, 0],
            },
          },
          claimed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', VoucherStatusEnum.UNUSED] },
                    { $ifNull: ['$customer_id', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inPool: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', VoucherStatusEnum.UNUSED] },
                    { $eq: [{ $ifNull: ['$customer_id', null] }, null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    return (
      row ?? { total: 0, used: 0, expired: 0, claimed: 0, inPool: 0 }
    );
  }

  /**
   * Gộp voucher pool theo "lô" để theo dõi mức sử dụng. Lô = mã bulk dạng
   * PREFIX-YYYYMMDD-NNNN nhóm theo PREFIX-YYYYMMDD (bỏ 5 ký tự cuối `-NNNN`).
   * Voucher grant đích danh (mã không theo format) không thuộc lô nào → bỏ qua.
   * 4 nhóm đếm loại trừ nhau (used → expired → claimed → inPool) nên cộng lại
   * bằng total.
   */
  async aggregateBatches(): Promise<
    Array<{
      _id: string;
      total: number;
      used: number;
      expired: number;
      claimed: number;
      inPool: number;
      discountCapVnd: number;
      expiresAt: Date;
      createdAt: Date;
    }>
  > {
    return VoucherModel.aggregate([
      { $match: { code: { $regex: /-\d{8}-\d{4}$/ } } },
      {
        $addFields: {
          batchKey: {
            $substrCP: [
              '$code',
              0,
              { $subtract: [{ $strLenCP: '$code' }, 5] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$batchKey',
          total: { $sum: 1 },
          used: {
            $sum: {
              $cond: [{ $eq: ['$status', VoucherStatusEnum.USED] }, 1, 0],
            },
          },
          expired: {
            $sum: {
              $cond: [{ $eq: ['$status', VoucherStatusEnum.EXPIRED] }, 1, 0],
            },
          },
          claimed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', VoucherStatusEnum.UNUSED] },
                    { $ifNull: ['$customer_id', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          inPool: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', VoucherStatusEnum.UNUSED] },
                    {
                      $eq: [{ $ifNull: ['$customer_id', null] }, null],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          discountCapVnd: { $max: '$discount_cap_vnd' },
          expiresAt: { $max: '$expires_at' },
          createdAt: { $min: '$created_at' },
        },
      },
      { $sort: { createdAt: -1 } },
    ]).exec();
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
