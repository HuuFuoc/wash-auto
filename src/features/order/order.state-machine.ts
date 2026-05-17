import { ACTIVE_ORDER_STATUSES, OrderStatusEnum } from './types/order-status.enum';

const TRANSITIONS: Record<OrderStatusEnum, OrderStatusEnum[]> = {
  [OrderStatusEnum.PENDING_PAYMENT]: [
    OrderStatusEnum.CONFIRMED,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.CONFIRMED]: [
    OrderStatusEnum.CHECKED_IN,
    OrderStatusEnum.CANCELLED,
    OrderStatusEnum.NO_SHOW,
  ],
  [OrderStatusEnum.CHECKED_IN]: [
    OrderStatusEnum.IN_PROGRESS,
    OrderStatusEnum.CANCELLED,
    OrderStatusEnum.NO_SHOW,
  ],
  [OrderStatusEnum.IN_PROGRESS]: [OrderStatusEnum.COMPLETED],
  [OrderStatusEnum.COMPLETED]: [],
  [OrderStatusEnum.CANCELLED]: [],
  [OrderStatusEnum.NO_SHOW]: [],
};

export function isValidOrderTransition(
  from: OrderStatusEnum,
  to: OrderStatusEnum,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Customer-initiated cancel is allowed only before the wash has started.
 * After CHECKED_IN, only staff can cancel (with a reason).
 */
export function isCancellableByOwner(status: OrderStatusEnum): boolean {
  return (
    status === OrderStatusEnum.PENDING_PAYMENT ||
    status === OrderStatusEnum.CONFIRMED
  );
}

export function consumesShiftCapacity(status: OrderStatusEnum): boolean {
  return ACTIVE_ORDER_STATUSES.includes(status);
}
