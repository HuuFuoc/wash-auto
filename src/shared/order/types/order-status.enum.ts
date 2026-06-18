export enum OrderStatusEnum {
  /** Online checkout link sent, waiting for PayOS webhook. */
  PENDING_PAYMENT = 'pending_payment',
  /** Paid (online) or booked (cash). Shift slot reserved. */
  CONFIRMED = 'confirmed',
  /** Customer has arrived at the shop. */
  CHECKED_IN = 'checked_in',
  /** Wash in progress. */
  IN_PROGRESS = 'in_progress',
  /** Wash finished. Terminal. */
  COMPLETED = 'completed',
  /** Cancelled by customer or staff or auto-expired. Terminal. */
  CANCELLED = 'cancelled',
  /** Customer did not show up. Terminal. */
  NO_SHOW = 'no_show',
}

/** Statuses that hold a shift capacity slot and must release on transition out. */
export const ACTIVE_ORDER_STATUSES: OrderStatusEnum[] = [
  OrderStatusEnum.PENDING_PAYMENT,
  OrderStatusEnum.CONFIRMED,
  OrderStatusEnum.CHECKED_IN,
  OrderStatusEnum.IN_PROGRESS,
];
