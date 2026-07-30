import { Types } from 'mongoose';
import { DiscountBreakdownDto } from '../../shared/pricing/dto/discount-breakdown.dto';
import { VoucherReasonCodeEnum } from '../../shared/pricing/types/voucher-reason-code.enum';
import { BenefitTypeEnum } from '../../shared/voucher-campaign/types/benefit-type.enum';
import {
  StackingPolicyEnum,
  allowsPromotion,
  allowsTier,
} from '../../shared/voucher-campaign/types/stacking-policy.enum';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { VoucherCampaignDocument } from '../voucher-campaign/voucher-campaign.model';
import {
  EligibilityResult,
  IEligibilityContext,
  VoucherEligibilityService,
} from './voucher-eligibility.service';

/** Everything the engine needs, all of it server-read. */
export interface IPricingInput {
  customerId: string;
  tier: TierConfigDocument;
  serviceTypeId: Types.ObjectId | string;
  vehicleTypeId: Types.ObjectId | string;
  serviceAcceptsVouchers: boolean;
  /** Price of the service × vehicle cell, in whole VND. */
  subtotalVnd: number;
  /** Golden-hour window percent for `scheduledAt`, or 0 when outside one. */
  windowDiscountPercent: number;
  /** Admin-configured ceiling on the stacked percent discount. */
  maxStackedPercent: number;
  voucherId?: string;
  now?: Date;
  forOrderId?: Types.ObjectId;
}

/** Breakdown plus the internals the order module needs to persist a row. */
export interface IPricingResult extends DiscountBreakdownDto {
  /** Percent actually applied by promotion+tier, after cap and stacking. */
  stackedPercent: number;
  /** `golden_hour:X+tier:Y+voucher:CODE`, kept for the existing column. */
  discountReason?: string;
  /** True when the booking fell inside a golden-hour window. */
  isGoldenHour: boolean;
  /** Cap of the supplied voucher, present even when it was rejected. */
  voucherDiscountCapVnd?: number;
}

/**
 * Golden-hour + tier percent, capped by policy — the ONE rule for the stacked
 * percent, exported so the slot listing quotes the same number the engine
 * charges. A window that discounts nothing pays nothing: the tier has only ever
 * paid out inside a discounting window, so a 0% window must not advertise the
 * tier percent either.
 */
export function stackedDiscountPercent(args: {
  /** Window percent for the booking time; 0 outside every window. */
  windowDiscountPercent: number;
  /** Tier percent, or 0 when the campaign forbids stacking with the tier. */
  tierDiscountPercent: number;
  /** Admin-configured ceiling on the stacked percent discount. */
  maxStackedPercent: number;
  /**
   * False when the campaign forbids stacking with a promotion: the window still
   * gates the tier payout, but its own percent is not paid.
   */
  payWindow?: boolean;
}): number {
  const windowPercent = Math.max(0, args.windowDiscountPercent);
  const insideDiscountingWindow = windowPercent > 0;
  const promotionPart =
    insideDiscountingWindow && args.payWindow !== false ? windowPercent : 0;
  const tierPart = insideDiscountingWindow
    ? Math.max(0, args.tierDiscountPercent)
    : 0;
  return Math.min(promotionPart + tierPart, args.maxStackedPercent);
}

/**
 * The one place an order's price is decided.
 *
 * Preview, order creation and (Phase 3) payment all call this, which is the
 * point: the customer cannot be shown one figure and charged another, because
 * there is no second implementation to drift from.
 *
 * Money is integer VND throughout. Percentages are applied with
 * `Math.round(amount * percent / 100)` — the same rounding the pre-campaign code
 * used — and every component is then clamped so the running total can never
 * exceed the subtotal or drive the payable amount below zero.
 */
export class DiscountCalculationService {
  constructor(private readonly eligibility: VoucherEligibilityService) {}

  async calculate(input: IPricingInput): Promise<IPricingResult> {
    const now = input.now ?? new Date();
    const subtotalVnd = Math.max(0, Math.round(input.subtotalVnd));

    // No voucher supplied: promotion + tier stack exactly as they always have.
    if (!input.voucherId) {
      return this.buildResult({
        subtotalVnd,
        eligibleAmountVnd: subtotalVnd,
        stacking: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
        input,
        voucherDiscountVnd: 0,
        voucherAccepted: true,
      });
    }

    const verdict = await this.eligibility.check({
      voucherId: input.voucherId,
      customerId: input.customerId,
      tier: input.tier,
      serviceTypeId: input.serviceTypeId,
      vehicleTypeId: input.vehicleTypeId,
      serviceAcceptsVouchers: input.serviceAcceptsVouchers,
      subtotalVnd,
      now,
      forOrderId: input.forOrderId,
    } satisfies IEligibilityContext);

    if (!verdict.ok) {
      // A refused voucher must not disturb the rest of the pricing: the
      // customer still gets their golden-hour and tier discount.
      return this.buildResult({
        subtotalVnd,
        eligibleAmountVnd: subtotalVnd,
        stacking: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
        input,
        voucherDiscountVnd: 0,
        voucherAccepted: false,
        rejection: verdict,
      });
    }

    const { voucher, campaign } = verdict;
    const stacking =
      campaign?.stacking_policy ?? StackingPolicyEnum.WITH_TIER_AND_PROMOTION;

    // Promotion and tier are settled FIRST so the voucher only ever eats into
    // what is genuinely left to pay — that ordering is what guarantees the
    // three components can never sum past the subtotal.
    const stackedPercent = this.resolveStackedPercent(input, stacking);
    const stackedVnd = Math.round((subtotalVnd * stackedPercent) / 100);
    const remainingVnd = Math.max(0, subtotalVnd - stackedVnd);

    const eligibleAmountVnd = subtotalVnd;
    const voucherDiscountVnd = this.voucherAmount({
      campaign,
      legacyCapVnd: voucher.discount_cap_vnd,
      eligibleRemainingVnd: Math.min(eligibleAmountVnd, remainingVnd),
      orderRemainingVnd: remainingVnd,
    });

    return this.buildResult({
      subtotalVnd,
      eligibleAmountVnd,
      stacking,
      input,
      voucherDiscountVnd,
      voucherAccepted: true,
      appliedVoucherId: voucher._id.toString(),
      voucherCode: voucher.code,
      voucherDiscountCapVnd:
        campaign?.discount_cap_vnd ?? voucher.discount_cap_vnd,
    });
  }

  /**
   * Applies the stacking policy to the existing
   * `min(window% + tier%, cap)` formula by zeroing the suppressed components
   * before the cap. Suppression can only ever lower the discount.
   */
  private resolveStackedPercent(
    input: IPricingInput,
    stacking: StackingPolicyEnum,
  ): number {
    // The window gate lives in `stackedDiscountPercent`: tier has only ever paid
    // out inside a discounting golden-hour window, and adding campaigns cannot
    // reprice bookings outside one.
    return stackedDiscountPercent({
      windowDiscountPercent: input.windowDiscountPercent,
      tierDiscountPercent: allowsTier(stacking)
        ? input.tier.discount_percent
        : 0,
      maxStackedPercent: input.maxStackedPercent,
      payWindow: allowsPromotion(stacking),
    });
  }

  /** Per-benefit-type voucher value, clamped to what is left on the order. */
  private voucherAmount(args: {
    campaign: VoucherCampaignDocument | null;
    legacyCapVnd: number;
    eligibleRemainingVnd: number;
    orderRemainingVnd: number;
  }): number {
    const ceiling = Math.min(args.eligibleRemainingVnd, args.orderRemainingVnd);
    if (ceiling <= 0) return 0;

    // Pre-campaign voucher: behaves as a fixed amount capped at discount_cap_vnd,
    // which is exactly what it did before campaigns existed.
    if (!args.campaign) return Math.min(args.legacyCapVnd, ceiling);

    switch (args.campaign.benefit_type) {
      case BenefitTypeEnum.FIXED_AMOUNT:
        return Math.min(args.campaign.discount_value, ceiling);

      case BenefitTypeEnum.PERCENT_OFF: {
        const raw = Math.round(
          (args.eligibleRemainingVnd * args.campaign.discount_value) / 100,
        );
        const capped =
          args.campaign.discount_cap_vnd != null
            ? Math.min(raw, args.campaign.discount_cap_vnd)
            : raw;
        return Math.min(capped, ceiling);
      }

      case BenefitTypeEnum.FREE_SERVICE:
        // The order holds one service, and eligibility has already confirmed it
        // is one this campaign covers — so "free service" is the whole of what
        // remains on that service.
        return ceiling;

      default:
        return 0;
    }
  }

  /** Splits the stacked percent back into its two reported components. */
  private buildResult(args: {
    subtotalVnd: number;
    eligibleAmountVnd: number;
    stacking: StackingPolicyEnum;
    input: IPricingInput;
    voucherDiscountVnd: number;
    voucherAccepted: boolean;
    rejection?: Extract<EligibilityResult, { ok: false }>;
    appliedVoucherId?: string;
    voucherCode?: string;
    voucherDiscountCapVnd?: number;
  }): IPricingResult {
    const { subtotalVnd, input, stacking } = args;
    const stackedPercent = this.resolveStackedPercent(input, stacking);
    const stackedVnd = Math.round((subtotalVnd * stackedPercent) / 100);

    const windowPercent = allowsPromotion(stacking)
      ? input.windowDiscountPercent
      : 0;
    // The cap applies to the pair, so split it proportionally and give the
    // rounding remainder to the promotion side — the two must re-sum exactly.
    const tierShare = stackedPercent - Math.min(windowPercent, stackedPercent);
    const tierDiscountVnd = Math.round((subtotalVnd * tierShare) / 100);
    const promotionDiscountVnd = stackedVnd - tierDiscountVnd;

    const totalDiscountVnd = Math.min(
      subtotalVnd,
      stackedVnd + args.voucherDiscountVnd,
    );
    const finalTotalVnd = Math.max(0, subtotalVnd - totalDiscountVnd);

    const result: IPricingResult = {
      subtotalVnd,
      eligibleAmountVnd: args.eligibleAmountVnd,
      promotionDiscountVnd,
      tierDiscountVnd,
      voucherDiscountVnd: args.voucherDiscountVnd,
      totalDiscountVnd,
      finalTotalVnd,
      voucherAccepted: args.voucherAccepted,
      appliedVoucherId: args.appliedVoucherId,
      stackedPercent,
      isGoldenHour: input.windowDiscountPercent > 0,
      voucherDiscountCapVnd:
        args.voucherDiscountCapVnd ?? args.rejection?.voucher?.discount_cap_vnd,
      discountReason: buildReason({
        isGoldenHour: input.windowDiscountPercent > 0,
        promotionDiscountVnd,
        tierDiscountVnd,
        tierName: input.tier.tier_name,
        voucherCode: args.voucherCode,
      }),
    };

    if (args.rejection) {
      result.invalidReasonCode = args.rejection.code;
      result.invalidReasonMessage = args.rejection.message;
    }
    return result;
  }
}

/** Rebuilds the human-readable `discount_reason` string the order column holds. */
function buildReason(args: {
  isGoldenHour: boolean;
  promotionDiscountVnd: number;
  tierDiscountVnd: number;
  tierName: string;
  voucherCode?: string;
}): string | undefined {
  const parts: string[] = [];
  if (args.isGoldenHour && args.promotionDiscountVnd > 0) {
    parts.push('golden_hour');
  }
  if (args.tierDiscountVnd > 0) parts.push(`tier:${args.tierName}`);
  if (args.voucherCode) parts.push(`voucher:${args.voucherCode}`);
  return parts.length > 0 ? parts.join('+') : undefined;
}

/** Re-exported so callers can name the refusal codes without a second import. */
export { VoucherReasonCodeEnum };
