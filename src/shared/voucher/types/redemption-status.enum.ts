export enum RedemptionStatusEnum {
  /** Voucher is held for this order while it waits for payment. */
  RESERVED = 'reserved',
  /** Order settled; the discount is final and counted against the budget. */
  APPLIED = 'applied',
  /** Reservation given back — payment failed, timed out, or was cancelled. */
  RELEASED = 'released',
  /** An APPLIED redemption undone (order cancelled after settling). */
  CANCELLED = 'cancelled',
}

/**
 * Statuses that still tie up the voucher. A voucher may have at most ONE
 * redemption in these states at a time — enforced by a unique index rather than
 * by application logic, so two concurrent orders cannot both hold it.
 */
export const ACTIVE_REDEMPTION_STATUSES: RedemptionStatusEnum[] = [
  RedemptionStatusEnum.RESERVED,
  RedemptionStatusEnum.APPLIED,
];
