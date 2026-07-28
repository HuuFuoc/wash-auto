export enum PaymentStatusEnum {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
  /**
   * Discounts covered the whole order, so there is nothing to collect. Settled
   * from the shop's point of view — no payment gateway call, no cash at the
   * counter — but deliberately NOT `PAID`, so revenue reporting never counts a
   * 0đ order as money taken.
   */
  NO_PAYMENT_REQUIRED = 'no_payment_required',
}

/** Payment states where the shop is not waiting on money from the customer. */
export const SETTLED_PAYMENT_STATUSES: PaymentStatusEnum[] = [
  PaymentStatusEnum.PAID,
  PaymentStatusEnum.NO_PAYMENT_REQUIRED,
];
