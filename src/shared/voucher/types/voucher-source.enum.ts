/**
 * Where a voucher came from. Free-text `granted_reason` stays for the human
 * story; this enum is what reporting groups by, so ROI per acquisition channel
 * is answerable without parsing strings.
 *
 * Phase 2 reuses these values as the campaign `source`, so a voucher's source
 * always equals its campaign's source.
 */
export enum VoucherSourceEnum {
  /** Minted by LoyaltyService when the wash-milestone threshold tripped. */
  LOYALTY_MILESTONE = 'loyalty_milestone',
  /** Admin granted it to one named customer. */
  ADMIN_GRANT = 'admin_grant',
  /** Claimed from a marketing campaign pool. */
  CAMPAIGN = 'campaign',
  BIRTHDAY = 'birthday',
  REFERRAL = 'referral',
  WINBACK = 'winback',
  /** Pre-existing rows backfilled by the migration; source was never recorded. */
  LEGACY = 'legacy',
}
