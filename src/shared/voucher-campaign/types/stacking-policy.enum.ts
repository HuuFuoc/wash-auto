/**
 * Which OTHER discounts a campaign's voucher tolerates on the same order.
 *
 * Mapping onto this codebase's pricing, which computes a single stacked percent
 * `min(goldenHour% + tier%, policyCap)` and only awards it inside a golden-hour
 * window:
 *   - "promotion" = the golden-hour window component
 *   - "tier"      = the loyalty tier component
 *
 * Suppressing one component zeroes it before the cap is applied; it never turns
 * a discount ON. So a voucher with WITH_TIER on a booking outside golden hours
 * still gets 0% from tier — exactly as today, because tier has never applied
 * outside a window. Nothing here reprices an order that carries no voucher.
 */
export enum StackingPolicyEnum {
  /** Voucher only. Golden-hour and tier discounts are both suppressed. */
  NONE = 'none',
  /** Voucher + tier. The golden-hour component is suppressed. */
  WITH_TIER = 'with_tier',
  /** Voucher + golden hour. The tier component is suppressed. */
  WITH_PROMOTION = 'with_promotion',
  /** Voucher on top of everything else. Matches the pre-campaign behaviour. */
  WITH_TIER_AND_PROMOTION = 'with_tier_and_promotion',
}

/** True when this policy lets the loyalty tier percent survive. */
export function allowsTier(policy: StackingPolicyEnum): boolean {
  return (
    policy === StackingPolicyEnum.WITH_TIER ||
    policy === StackingPolicyEnum.WITH_TIER_AND_PROMOTION
  );
}

/** True when this policy lets the golden-hour window percent survive. */
export function allowsPromotion(policy: StackingPolicyEnum): boolean {
  return (
    policy === StackingPolicyEnum.WITH_PROMOTION ||
    policy === StackingPolicyEnum.WITH_TIER_AND_PROMOTION
  );
}
