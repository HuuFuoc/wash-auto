export enum VoucherTypeEnum {
  /**
   * Legacy single-type free wash, kept so historical vouchers in the
   * database continue to validate. New mints are now tier-specific (see
   * below) — this value is never produced by the loyalty milestone after
   * the tier-aware voucher refactor.
   */
  FREE_WASH = 'free_wash',

  /**
   * Bronze-tier reward: free one Basic Wash (cap matches Basic base price,
   * applicable only to a service flagged `is_default_basic`).
   */
  BRONZE_FREE_BASIC = 'bronze_free_basic',

  /** Silver-tier reward: fixed VND off any service. */
  SILVER_DISCOUNT = 'silver_discount',

  /**
   * Gold-tier reward: highest fixed VND off any service including Detailing.
   * The cap is configurable but defaults higher than the Silver one.
   */
  GOLD_DISCOUNT = 'gold_discount',
}
