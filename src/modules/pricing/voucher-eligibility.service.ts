import { Types } from 'mongoose';
import {
  VOUCHER_REASON_MESSAGE,
  VoucherReasonCodeEnum,
} from '../../shared/pricing/types/voucher-reason-code.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { VoucherDocument } from '../voucher/voucher.model';
import { VoucherRepository } from '../voucher/voucher.repository';
import { VoucherCampaignDocument } from '../voucher-campaign/voucher-campaign.model';
import { VoucherCampaignRepository } from '../voucher-campaign/voucher-campaign.repository';

/** Everything the checks need, all of it already read from the database. */
export interface IEligibilityContext {
  voucherId: string;
  customerId: string;
  /** Loyalty tier resolved server-side. Never taken from the request. */
  tier: TierConfigDocument;
  serviceTypeId: Types.ObjectId | string;
  vehicleTypeId: Types.ObjectId | string;
  /** Whether the service type accepts vouchers at all (legacy global flag). */
  serviceAcceptsVouchers: boolean;
  subtotalVnd: number;
  /** Evaluation instant, passed in so preview and create agree exactly. */
  now: Date;
  /**
   * Order the voucher may legitimately already be reserved for. Lets a caller
   * re-price an order that is holding the voucher without tripping
   * VOUCHER_RESERVED against itself.
   */
  forOrderId?: Types.ObjectId;
}

export interface IEligibilityRejection {
  ok: false;
  code: VoucherReasonCodeEnum;
  message: string;
  /** Present when the voucher was found, even if it was then rejected. */
  voucher?: VoucherDocument;
}

export interface IEligibilityAcceptance {
  ok: true;
  voucher: VoucherDocument;
  /**
   * Null for pre-campaign vouchers that the backfill has not reached. The
   * calculator falls back to legacy behaviour for those.
   */
  campaign: VoucherCampaignDocument | null;
}

export type EligibilityResult = IEligibilityRejection | IEligibilityAcceptance;

function reject(
  code: VoucherReasonCodeEnum,
  voucher?: VoucherDocument,
  message?: string,
): IEligibilityRejection {
  return {
    ok: false,
    code,
    message: message ?? VOUCHER_REASON_MESSAGE[code],
    voucher,
  };
}

/**
 * Decides whether one voucher may be applied to one order, and says precisely
 * why not when it may not.
 *
 * Every input is read from the database by the caller — the customer's tier,
 * the service price, the vehicle type. Nothing the client sent is trusted, so a
 * crafted request cannot claim a higher tier or a cheaper service to unlock a
 * voucher it should not have.
 *
 * This service performs NO writes and holds NO locks. It is the read-side check
 * used by preview and by the pre-flight of order creation; the authoritative
 * re-check happens inside the reservation transaction (Phase 3), because
 * anything checked outside a lock can go stale before it is acted on.
 */
export class VoucherEligibilityService {
  constructor(
    private readonly voucherRepository: VoucherRepository,
    private readonly campaignRepository: VoucherCampaignRepository,
  ) {}

  async check(ctx: IEligibilityContext): Promise<EligibilityResult> {
    const voucher = await this.voucherRepository.findById(ctx.voucherId);
    if (!voucher) return reject(VoucherReasonCodeEnum.VOUCHER_NOT_FOUND);

    // Ownership before anything else: a voucher belonging to someone else must
    // look identical to one that does not exist, so this endpoint cannot be
    // used to probe other customers' wallets.
    if (voucher.customer_id?.toString() !== ctx.customerId) {
      return reject(VoucherReasonCodeEnum.VOUCHER_NOT_OWNED);
    }

    const statusRejection = this.checkStatus(voucher, ctx);
    if (statusRejection) return statusRejection;

    if (voucher.expires_at.getTime() <= ctx.now.getTime()) {
      return reject(VoucherReasonCodeEnum.VOUCHER_EXPIRED, voucher);
    }

    const campaign = voucher.campaign_id
      ? await this.campaignRepository.findById(voucher.campaign_id)
      : null;

    // Legacy voucher with no campaign yet: fall back to the global service flag
    // that governed vouchers before campaigns existed.
    if (!campaign) {
      return ctx.serviceAcceptsVouchers
        ? { ok: true, voucher, campaign: null }
        : reject(VoucherReasonCodeEnum.SERVICE_NOT_ELIGIBLE, voucher);
    }

    const campaignRejection = await this.checkCampaign(voucher, campaign, ctx);
    if (campaignRejection) return campaignRejection;

    return { ok: true, voucher, campaign };
  }

  /** Voucher-row state: used, revoked, or held by a different order. */
  private checkStatus(
    voucher: VoucherDocument,
    ctx: IEligibilityContext,
  ): IEligibilityRejection | null {
    switch (voucher.status) {
      case VoucherStatusEnum.USED:
        return reject(VoucherReasonCodeEnum.VOUCHER_ALREADY_USED, voucher);
      case VoucherStatusEnum.REVOKED:
        return reject(VoucherReasonCodeEnum.VOUCHER_REVOKED, voucher);
      case VoucherStatusEnum.EXPIRED:
        return reject(VoucherReasonCodeEnum.VOUCHER_EXPIRED, voucher);
      case VoucherStatusEnum.RESERVED: {
        const heldForThisOrder =
          ctx.forOrderId &&
          voucher.reserved_order_id?.toString() === ctx.forOrderId.toString();
        return heldForThisOrder
          ? null
          : reject(VoucherReasonCodeEnum.VOUCHER_RESERVED, voucher);
      }
      default:
        return null;
    }
  }

  /** Campaign-level rules: window, status, whitelists, minimum, usage limits. */
  private async checkCampaign(
    voucher: VoucherDocument,
    campaign: VoucherCampaignDocument,
    ctx: IEligibilityContext,
  ): Promise<IEligibilityRejection | null> {
    const nowMs = ctx.now.getTime();

    if (campaign.status !== CampaignStatusEnum.ACTIVE) {
      return reject(VoucherReasonCodeEnum.CAMPAIGN_NOT_ACTIVE, voucher);
    }
    if (nowMs < campaign.valid_from.getTime()) {
      return reject(VoucherReasonCodeEnum.VOUCHER_NOT_ACTIVE, voucher);
    }
    if (nowMs >= campaign.valid_until.getTime()) {
      return reject(VoucherReasonCodeEnum.VOUCHER_EXPIRED, voucher);
    }

    if (!matchesWhitelist(campaign.allowed_tier_ids, ctx.tier._id)) {
      return reject(
        VoucherReasonCodeEnum.TIER_NOT_ELIGIBLE,
        voucher,
        `Voucher này chỉ dành cho hạng thành viên khác (bạn đang ở hạng ${ctx.tier.tier_name})`,
      );
    }
    if (
      !matchesWhitelist(campaign.applicable_service_type_ids, ctx.serviceTypeId)
    ) {
      return reject(VoucherReasonCodeEnum.SERVICE_NOT_ELIGIBLE, voucher);
    }
    if (
      !matchesWhitelist(campaign.applicable_vehicle_type_ids, ctx.vehicleTypeId)
    ) {
      return reject(VoucherReasonCodeEnum.VEHICLE_NOT_ELIGIBLE, voucher);
    }

    if (ctx.subtotalVnd < campaign.min_order_vnd) {
      return reject(
        VoucherReasonCodeEnum.ORDER_BELOW_MINIMUM,
        voucher,
        `Đơn tối thiểu ${campaign.min_order_vnd.toLocaleString('vi-VN')}đ ` +
          `để dùng voucher này (đơn hiện tại ${ctx.subtotalVnd.toLocaleString('vi-VN')}đ)`,
      );
    }

    // Budget gate, read from the campaign's cached counter. A campaign that has
    // already given away its budget stops discounting rather than overspending;
    // the counter is reconcilable from voucher_redemptions, so a drift can be
    // repaired without the gate ever having failed open.
    if (
      campaign.budget_vnd != null &&
      campaign.redeemed_vnd >= campaign.budget_vnd
    ) {
      return reject(VoucherReasonCodeEnum.CAMPAIGN_BUDGET_EXCEEDED, voucher);
    }

    // Per-customer cap. The voucher in hand is itself one of the issued ones,
    // so holding exactly the cap is fine — going over it is not, which only
    // happens if vouchers were granted around the limit.
    const held = await this.voucherRepository.countByCampaignForCustomer(
      campaign._id,
      ctx.customerId,
    );
    if (held > campaign.max_uses_per_customer) {
      return reject(VoucherReasonCodeEnum.USAGE_LIMIT_REACHED, voucher);
    }

    return null;
  }
}

/**
 * Whitelist semantics, applied identically to tiers, services and vehicles:
 * an EMPTY list means "no restriction", a non-empty list must contain the id.
 */
function matchesWhitelist(
  whitelist: Types.ObjectId[],
  candidate: Types.ObjectId | string,
): boolean {
  if (whitelist.length === 0) return true;
  const wanted = candidate.toString();
  return whitelist.some((id) => id.toString() === wanted);
}
