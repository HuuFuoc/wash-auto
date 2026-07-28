export enum VoucherStatusEnum {
  /** Minted (and claimed, if it came from a pool) but not attached to any order. */
  UNUSED = 'unused',
  /**
   * Held for one specific in-flight order until `reserved_until`. Cannot be
   * redeemed by another order; released back to UNUSED if that order dies.
   */
  RESERVED = 'reserved',
  /** Redeemed on `used_order_id`. Terminal. */
  USED = 'used',
  /** Passed `expires_at` without being redeemed. Terminal. */
  EXPIRED = 'expired',
  /**
   * Killed early by an admin (fraud, wrong grant, campaign rollback). Terminal,
   * and deliberately NOT merged into EXPIRED so stats can tell an operations
   * failure apart from a marketing one.
   */
  REVOKED = 'revoked',
}

/** Statuses a voucher can never leave. Nothing may reserve or redeem these. */
export const TERMINAL_VOUCHER_STATUSES: VoucherStatusEnum[] = [
  VoucherStatusEnum.USED,
  VoucherStatusEnum.EXPIRED,
  VoucherStatusEnum.REVOKED,
];
