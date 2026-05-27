export enum LoyaltyTransactionTypeEnum {
  /** Points earned when an order moves to COMPLETED. */
  EARN_COMPLETED = 'earn_completed',
  /** Points deducted when a CONFIRMED order is flipped to NO_SHOW. */
  DEDUCT_NO_SHOW = 'deduct_no_show',
  /** Annual reset cron zeroed the balance. */
  ANNUAL_RESET = 'annual_reset',
  /** 10-wash threshold minted a free-wash voucher (no point delta). */
  VOUCHER_GRANTED = 'voucher_granted',
  /** Tier moved up or down after a balance change (no point delta). */
  TIER_CHANGED = 'tier_changed',
}
