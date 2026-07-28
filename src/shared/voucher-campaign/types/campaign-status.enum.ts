export enum CampaignStatusEnum {
  /** Being edited. Mints nothing, claims nothing. */
  DRAFT = 'draft',
  /** Approved but `valid_from` has not arrived yet. */
  SCHEDULED = 'scheduled',
  /** Live: vouchers can be claimed and redeemed. */
  ACTIVE = 'active',
  /** Temporarily halted. Existing vouchers cannot be used until resumed. */
  PAUSED = 'paused',
  /** Finished. Terminal — a campaign never leaves ENDED. */
  ENDED = 'ended',
}

/**
 * The only status under which a voucher may be claimed or redeemed. A campaign
 * that is DRAFT/SCHEDULED/PAUSED/ENDED blocks its vouchers even if the voucher
 * row itself still says UNUSED.
 */
export const REDEEMABLE_CAMPAIGN_STATUS = CampaignStatusEnum.ACTIVE;

/** Campaigns that have not started handing anything out yet. */
export const PRE_LAUNCH_CAMPAIGN_STATUSES: CampaignStatusEnum[] = [
  CampaignStatusEnum.DRAFT,
  CampaignStatusEnum.SCHEDULED,
];
