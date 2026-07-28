import { ClientSession, Types } from 'mongoose';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';
import { VoucherDocument, VoucherModel } from './voucher.model';

export interface ICreateVoucherInput {
  customerId: Types.ObjectId;
  code: string;
  type: VoucherTypeEnum;
  discountCapVnd: number;
  expiresAt: Date;
  grantedSource: VoucherSourceEnum;
  grantedReason?: string;
  campaignId?: Types.ObjectId;
}

/** One pool voucher in a bulk batch (no owner until claimed). */
export interface IBulkVoucherInput {
  code: string;
  type: VoucherTypeEnum;
  discountCapVnd: number;
  expiresAt: Date;
  grantedSource: VoucherSourceEnum;
  grantedReason?: string;
  campaignId?: Types.ObjectId;
}

/**
 * Mutually exclusive status counts. Order of evaluation matters — every voucher
 * lands in exactly one bucket, so the six add up to `total`:
 *   used → revoked → expired → reserved → claimed → inPool
 */
export interface IVoucherStatsRow {
  total: number;
  used: number;
  revoked: number;
  expired: number;
  reserved: number;
  claimed: number;
  inPool: number;
}

/** One pool batch (PREFIX-YYYYMMDD) with its usage counts. */
export interface IVoucherBatchRow extends IVoucherStatsRow {
  _id: string;
  discountCapVnd: number;
  expiresAt: Date;
  createdAt: Date;
}

const EMPTY_STATS: IVoucherStatsRow = {
  total: 0,
  used: 0,
  revoked: 0,
  expired: 0,
  reserved: 0,
  claimed: 0,
  inPool: 0,
};

/** `$sum` 1 for every doc whose status equals `status`. */
const countStatus = (status: VoucherStatusEnum) => ({
  $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] },
});

/** `$sum` 1 for every UNUSED doc, split on whether someone owns it yet. */
const countUnowned = (owned: boolean) => ({
  $sum: {
    $cond: [
      {
        $and: [
          { $eq: ['$status', VoucherStatusEnum.UNUSED] },
          owned
            ? { $ifNull: ['$customer_id', false] }
            : { $eq: [{ $ifNull: ['$customer_id', null] }, null] },
        ],
      },
      1,
      0,
    ],
  },
});

/**
 * `$group` accumulators shared by the global stats and the per-batch rollup, so
 * the two can never drift into reporting different numbers for the same data.
 * The buckets are mutually exclusive and sum to `total`.
 */
const STATUS_BUCKETS = {
  total: { $sum: 1 },
  used: countStatus(VoucherStatusEnum.USED),
  revoked: countStatus(VoucherStatusEnum.REVOKED),
  expired: countStatus(VoucherStatusEnum.EXPIRED),
  reserved: countStatus(VoucherStatusEnum.RESERVED),
  claimed: countUnowned(true),
  inPool: countUnowned(false),
} as const;

export class VoucherRepository {
  async create(input: ICreateVoucherInput): Promise<VoucherDocument> {
    return VoucherModel.create({
      campaign_id: input.campaignId,
      customer_id: input.customerId,
      code: input.code,
      type: input.type,
      status: VoucherStatusEnum.UNUSED,
      discount_cap_vnd: input.discountCapVnd,
      expires_at: input.expiresAt,
      granted_source: input.grantedSource,
      granted_reason: input.grantedReason,
      granted_at: new Date(),
    });
  }

  /** Inserts a batch of unowned pool vouchers (customers claim them by code). */
  async createBulk(inputs: IBulkVoucherInput[]): Promise<VoucherDocument[]> {
    if (inputs.length === 0) return [];
    const now = new Date();
    const docs = inputs.map((i) => ({
      campaign_id: i.campaignId,
      code: i.code,
      type: i.type,
      status: VoucherStatusEnum.UNUSED,
      discount_cap_vnd: i.discountCapVnd,
      expires_at: i.expiresAt,
      granted_source: i.grantedSource,
      granted_reason: i.grantedReason,
      granted_at: now,
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
   * Hands a just-claimed voucher back to the pool. Used as the compensating
   * action when a post-claim recount finds the customer went over the
   * campaign's per-customer limit — without a transaction, claiming and then
   * undoing is what keeps two concurrent claims from both sticking.
   */
  async releaseClaim(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await VoucherModel.updateOne(
      {
        _id: id,
        customer_id: new Types.ObjectId(customerId),
        status: VoucherStatusEnum.UNUSED,
      },
      { $unset: { customer_id: '' } },
    ).exec();
  }

  /**
   * How many vouchers this campaign has issued in total. Counted from the
   * vouchers themselves rather than a stored counter, so the number cannot drift
   * away from reality; Phase 3 adds a cached counter with this as its audit.
   */
  async countByCampaign(campaignId: Types.ObjectId | string): Promise<number> {
    if (!Types.ObjectId.isValid(campaignId)) return 0;
    return VoucherModel.countDocuments({
      campaign_id: new Types.ObjectId(campaignId),
    }).exec();
  }

  /** How many of this campaign's vouchers one customer already holds. */
  async countByCampaignForCustomer(
    campaignId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(campaignId)) return 0;
    return VoucherModel.countDocuments({
      campaign_id: new Types.ObjectId(campaignId),
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  /**
   * Atomically hands the customer one unclaimed voucher FROM A GIVEN CAMPAIGN.
   * Used by the public claim-code flow, where the customer types the campaign's
   * code rather than an individual voucher code.
   */
  async claimAnyFromCampaign(
    campaignId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(campaignId)) return null;
    return VoucherModel.findOneAndUpdate(
      {
        campaign_id: new Types.ObjectId(campaignId),
        customer_id: { $exists: false },
        status: VoucherStatusEnum.UNUSED,
        expires_at: { $gt: new Date() },
      },
      { $set: { customer_id: new Types.ObjectId(customerId) } },
      { returnDocument: 'after' },
    ).exec();
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
   * 6 nhóm loại trừ nhau (used → revoked → expired → reserved → claimed →
   * inPool) cộng lại = total.
   */
  async aggregateStats(): Promise<IVoucherStatsRow> {
    const [row] = await VoucherModel.aggregate<IVoucherStatsRow>([
      { $group: { _id: null, ...STATUS_BUCKETS } },
    ]).exec();
    return row ?? EMPTY_STATS;
  }

  /**
   * The same six buckets, scoped to one campaign. Uses the campaign_id foreign
   * key, which is what makes per-campaign reporting possible without parsing
   * voucher codes the way the legacy batch summary had to.
   */
  async aggregateStatsForCampaign(
    campaignId: Types.ObjectId | string,
  ): Promise<IVoucherStatsRow> {
    if (!Types.ObjectId.isValid(campaignId)) return EMPTY_STATS;
    const [row] = await VoucherModel.aggregate<IVoucherStatsRow>([
      { $match: { campaign_id: new Types.ObjectId(campaignId) } },
      { $group: { _id: null, ...STATUS_BUCKETS } },
    ]).exec();
    return row ?? EMPTY_STATS;
  }

  /**
   * Gộp voucher pool theo "lô" để theo dõi mức sử dụng. Lô = mã bulk dạng
   * PREFIX-YYYYMMDD-NNNN nhóm theo PREFIX-YYYYMMDD (bỏ 5 ký tự cuối `-NNNN`).
   * Voucher grant đích danh (mã không theo format) không thuộc lô nào → bỏ qua.
   * 6 nhóm đếm loại trừ nhau nên cộng lại bằng total.
   *
   * LEGACY: đây là chỗ DUY NHẤT còn suy ra "lô" từ format mã. Phase 2 thay bằng
   * campaign_id thật; giữ nguyên tới lúc đó để trang admin hiện có không vỡ.
   */
  async aggregateBatches(): Promise<IVoucherBatchRow[]> {
    return VoucherModel.aggregate<IVoucherBatchRow>([
      { $match: { code: { $regex: /-\d{8}-\d{4}$/ } } },
      {
        $addFields: {
          batchKey: {
            $substrCP: ['$code', 0, { $subtract: [{ $strLenCP: '$code' }, 5] }],
          },
        },
      },
      {
        $group: {
          _id: '$batchKey',
          ...STATUS_BUCKETS,
          discountCapVnd: { $max: '$discount_cap_vnd' },
          expiresAt: { $max: '$expires_at' },
          createdAt: { $min: '$created_at' },
        },
      },
      { $sort: { createdAt: -1 } },
    ]).exec();
  }

  /**
   * Atomically flips an UNUSED voucher to REVOKED, recording who killed it and
   * why. Returns null if the voucher does not exist or has already left UNUSED.
   *
   * REVOKED is its own terminal status — it used to be written as EXPIRED with
   * a `[REVOKED]` prefix stuffed into granted_reason, which made every report
   * count an operations decision as a customer no-op.
   */
  async revoke(
    id: Types.ObjectId | string,
    reason: string,
    revokedBy?: Types.ObjectId,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOneAndUpdate(
      { _id: id, status: VoucherStatusEnum.UNUSED },
      {
        $set: {
          status: VoucherStatusEnum.REVOKED,
          revoked_at: new Date(),
          revoked_by: revokedBy,
          revoke_reason: reason,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Atomically puts an UNUSED voucher on hold for one order.
   *
   * This compare-and-set IS the concurrency control: MongoDB has no row locks,
   * so "only one order may hold this voucher" is expressed as a conditional
   * update that a second concurrent request simply fails to match.
   *
   * Re-reserving for the SAME order succeeds, which keeps a retried request
   * idempotent instead of 404-ing on its own earlier hold.
   */
  async reserve(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
    reservedUntil: Date,
    session?: ClientSession,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOneAndUpdate(
      {
        _id: id,
        customer_id: new Types.ObjectId(customerId),
        expires_at: { $gt: new Date() },
        $or: [
          { status: VoucherStatusEnum.UNUSED },
          { status: VoucherStatusEnum.RESERVED, reserved_order_id: orderId },
        ],
      },
      {
        $set: {
          status: VoucherStatusEnum.RESERVED,
          reserved_order_id: orderId,
          reserved_at: new Date(),
          reserved_until: reservedUntil,
        },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /**
   * Gives a held voucher back. Only releases a hold belonging to `orderId`, so
   * a late sweep cannot free a voucher another order has since taken.
   */
  async releaseReservation(
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<VoucherDocument | null> {
    return VoucherModel.findOneAndUpdate(
      {
        reserved_order_id: orderId,
        status: VoucherStatusEnum.RESERVED,
      },
      {
        $set: { status: VoucherStatusEnum.UNUSED },
        $unset: { reserved_order_id: '', reserved_at: '', reserved_until: '' },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /**
   * RESERVED → USED for the order that holds it. The `reserved_order_id` clause
   * is what stops a webhook for order A settling a voucher order B has taken
   * over in the meantime.
   */
  async redeemReserved(
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<VoucherDocument | null> {
    return VoucherModel.findOneAndUpdate(
      { reserved_order_id: orderId, status: VoucherStatusEnum.RESERVED },
      {
        $set: {
          status: VoucherStatusEnum.USED,
          used_at: new Date(),
          used_order_id: orderId,
        },
        $unset: { reserved_order_id: '', reserved_at: '', reserved_until: '' },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /**
   * Atomically marks a voucher as USED for `orderId`. Returns null if the
   * voucher does not exist, is not owned by the customer, has already left a
   * redeemable state, or has expired.
   *
   * Accepts UNUSED (redeem straight away) or RESERVED-for-this-same-order
   * (confirm a hold placed earlier). A voucher reserved for a DIFFERENT order
   * fails the filter, which is what stops two concurrent orders spending it.
   */
  async consume(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherModel.findOneAndUpdate(
      {
        _id: id,
        customer_id: new Types.ObjectId(customerId),
        expires_at: { $gt: new Date() },
        $or: [
          { status: VoucherStatusEnum.UNUSED },
          {
            status: VoucherStatusEnum.RESERVED,
            reserved_order_id: orderId,
          },
        ],
      },
      {
        $set: {
          status: VoucherStatusEnum.USED,
          used_at: new Date(),
          used_order_id: orderId,
        },
        $unset: { reserved_order_id: '', reserved_at: '', reserved_until: '' },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /**
   * Owned, still-usable vouchers lapsing inside the given window. Only UNUSED
   * rows with an owner: a pool voucher nobody holds has no one to warn, and a
   * reserved one is already on its way to being spent.
   */
  async findExpiringOwned(
    from: Date,
    until: Date,
    limit = 500,
  ): Promise<VoucherDocument[]> {
    return VoucherModel.find({
      status: VoucherStatusEnum.UNUSED,
      customer_id: { $exists: true },
      expires_at: { $gt: from, $lte: until },
    })
      .limit(limit)
      .exec();
  }

  /**
   * Hands a voucher back after its order died. Only USED or RESERVED rows are
   * eligible: the previous version updated by id unconditionally, which could
   * resurrect an EXPIRED or REVOKED voucher into UNUSED.
   *
   * A voucher whose deadline passed while it sat on the dead order goes to
   * EXPIRED rather than UNUSED — handing back something already worthless would
   * only produce a confusing entry in the customer's wallet.
   */
  async refund(id: Types.ObjectId | string): Promise<VoucherDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const now = new Date();
    const releasable = {
      _id: id,
      status: {
        $in: [VoucherStatusEnum.USED, VoucherStatusEnum.RESERVED],
      },
    };
    const clearHold = {
      used_at: '',
      used_order_id: '',
      reserved_order_id: '',
      reserved_at: '',
      reserved_until: '',
    };

    const restored = await VoucherModel.findOneAndUpdate(
      { ...releasable, expires_at: { $gt: now } },
      {
        $set: { status: VoucherStatusEnum.UNUSED },
        $unset: clearHold,
      },
      { returnDocument: 'after' },
    ).exec();
    if (restored) return restored;

    // Still held, but past its deadline — retire it instead of reviving it.
    return VoucherModel.findOneAndUpdate(
      { ...releasable, expires_at: { $lte: now } },
      {
        $set: { status: VoucherStatusEnum.EXPIRED },
        $unset: clearHold,
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
