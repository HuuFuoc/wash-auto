export enum PaymentMethodEnum {
  /** PayOS checkout. Order starts as PENDING_PAYMENT until the webhook arrives. */
  ONLINE = 'online',
  /** Cashier collects at the counter. Order starts as CONFIRMED with payment_status=unpaid. */
  CASH = 'cash',
}
