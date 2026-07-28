/**
 * What a campaign's vouchers actually do to an order.
 *
 * There is deliberately NO `FREE_ADDON`: an Order in this system references
 * exactly one service type and one vehicle, so there are no add-on line items to
 * discount. Introducing the value without a domain behind it would only produce
 * a benefit type that always fails eligibility.
 */
export enum BenefitTypeEnum {
  /** Knock a flat VND amount off, bounded by what is left to pay. */
  FIXED_AMOUNT = 'fixed_amount',
  /** Knock a percentage off, optionally bounded by `discount_cap_vnd`. */
  PERCENT_OFF = 'percent_off',
  /**
   * Cover the eligible service entirely. Because an order holds a single
   * service, this is a 100% discount on that service — but it still has to pass
   * the campaign's service-type eligibility, so "free basic wash" cannot be
   * spent on a detailing package.
   */
  FREE_SERVICE = 'free_service',
}

/** Benefit types whose `discount_value` is a percentage rather than VND. */
export const PERCENT_BENEFIT_TYPES: BenefitTypeEnum[] = [
  BenefitTypeEnum.PERCENT_OFF,
];
