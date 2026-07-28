import { ClientSession, Types } from 'mongoose';
import { RedemptionStatusEnum } from '../../shared/voucher/types/redemption-status.enum';
import {
  VoucherRedemptionDocument,
  VoucherRedemptionModel,
} from './voucher-redemption.model';

export interface ICreateRedemptionInput {
  voucherId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  customerId: Types.ObjectId;
  orderId: Types.ObjectId;
  originalOrderVnd: number;
  eligibleAmountVnd: number;
  promotionDiscountVnd: number;
  tierDiscountVnd: number;
  voucherDiscountVnd: number;
  finalOrderVnd: number;
  reservedUntil?: Date;
}

/** Reconciled totals for one campaign, computed from the redemption rows. */
export interface ICampaignRedemptionTotals {
  appliedCount: number;
  discountVnd: number;
  originalVnd: number;
  finalVnd: number;
}

export class VoucherRedemptionRepository {
  /**
   * Opens a redemption. `active_voucher_id` carries the unique index, so a
   * second concurrent reservation of the same voucher fails with E11000 rather
   * than quietly creating a duplicate — the caller treats that as "lost the
   * race" and gives up.
   */
  async createReserved(
    input: ICreateRedemptionInput,
    session?: ClientSession,
  ): Promise<VoucherRedemptionDocument> {
    const [doc] = await VoucherRedemptionModel.create(
      [
        {
          voucher_id: input.voucherId,
          campaign_id: input.campaignId,
          customer_id: input.customerId,
          order_id: input.orderId,
          status: RedemptionStatusEnum.RESERVED,
          active_voucher_id: input.voucherId,
          original_order_vnd: input.originalOrderVnd,
          eligible_amount_vnd: input.eligibleAmountVnd,
          promotion_discount_vnd: input.promotionDiscountVnd,
          tier_discount_vnd: input.tierDiscountVnd,
          voucher_discount_vnd: input.voucherDiscountVnd,
          final_order_vnd: input.finalOrderVnd,
          reserved_until: input.reservedUntil,
        },
      ],
      session ? { session } : undefined,
    );
    return doc;
  }

  /** RESERVED → APPLIED. Keeps `active_voucher_id` set: the voucher is spent. */
  async markApplied(
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<VoucherRedemptionDocument | null> {
    return VoucherRedemptionModel.findOneAndUpdate(
      { order_id: orderId, status: RedemptionStatusEnum.RESERVED },
      {
        $set: {
          status: RedemptionStatusEnum.APPLIED,
          applied_at: new Date(),
        },
        $unset: { reserved_until: '' },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /**
   * Closes a redemption and frees the voucher for reuse. RESERVED → RELEASED
   * (never settled) or APPLIED → CANCELLED (settled then undone); unsetting
   * `active_voucher_id` is what releases the unique-index slot.
   */
  async close(
    orderId: Types.ObjectId,
    next: RedemptionStatusEnum.RELEASED | RedemptionStatusEnum.CANCELLED,
    session?: ClientSession,
  ): Promise<VoucherRedemptionDocument | null> {
    const from =
      next === RedemptionStatusEnum.RELEASED
        ? RedemptionStatusEnum.RESERVED
        : RedemptionStatusEnum.APPLIED;
    return VoucherRedemptionModel.findOneAndUpdate(
      { order_id: orderId, status: from },
      {
        $set: { status: next, released_at: new Date() },
        $unset: { active_voucher_id: '', reserved_until: '' },
      },
      { returnDocument: 'after', session },
    ).exec();
  }

  /** Closes whichever active redemption an order holds, whatever its state. */
  async closeAnyActive(
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<VoucherRedemptionDocument | null> {
    const released = await this.close(
      orderId,
      RedemptionStatusEnum.RELEASED,
      session,
    );
    if (released) return released;
    return this.close(orderId, RedemptionStatusEnum.CANCELLED, session);
  }

  async findByOrder(
    orderId: Types.ObjectId | string,
  ): Promise<VoucherRedemptionDocument | null> {
    if (!Types.ObjectId.isValid(orderId)) return null;
    return VoucherRedemptionModel.findOne({
      order_id: new Types.ObjectId(orderId),
    })
      .sort({ created_at: -1 })
      .exec();
  }

  /** Reservations whose hold has lapsed. Input to the sweep job. */
  async findExpiredReservations(
    now: Date,
    limit = 100,
  ): Promise<VoucherRedemptionDocument[]> {
    return VoucherRedemptionModel.find({
      status: RedemptionStatusEnum.RESERVED,
      reserved_until: { $lte: now },
    })
      .limit(limit)
      .exec();
  }

  /**
   * Recomputes a campaign's spend from the redemption rows. This is the audit
   * that the cached counters on the campaign are checked against — a counter
   * that has drifted (a crashed process, a manual edit) can always be restored
   * from here, which is why the counters are an optimisation and not the truth.
   */
  async totalsForCampaign(
    campaignId: Types.ObjectId | string,
  ): Promise<ICampaignRedemptionTotals> {
    if (!Types.ObjectId.isValid(campaignId)) {
      return { appliedCount: 0, discountVnd: 0, originalVnd: 0, finalVnd: 0 };
    }
    const [row] = await VoucherRedemptionModel.aggregate<{
      appliedCount: number;
      discountVnd: number;
      originalVnd: number;
      finalVnd: number;
    }>([
      {
        $match: {
          campaign_id: new Types.ObjectId(campaignId),
          status: RedemptionStatusEnum.APPLIED,
        },
      },
      {
        $group: {
          _id: null,
          appliedCount: { $sum: 1 },
          discountVnd: { $sum: '$voucher_discount_vnd' },
          originalVnd: { $sum: '$original_order_vnd' },
          finalVnd: { $sum: '$final_order_vnd' },
        },
      },
    ]).exec();
    return (
      row ?? { appliedCount: 0, discountVnd: 0, originalVnd: 0, finalVnd: 0 }
    );
  }
}
