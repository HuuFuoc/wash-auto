import {
  ACTIVE_ORDER_STATUSES,
  OrderStatusEnum,
} from './types/order-status.enum';

// Operational transitions (→ checked_in / in_progress / completed) are NOT
// listed here on purpose. They are driven by the Work Order flow:
//   - checked_in  ← POST /admin/work-orders          (cashier check-in)
//   - in_progress ← PATCH /me/work-orders/:id/start  (washer starts)
//   - completed   ← PATCH /admin/work-orders/:id/qc  (QC passed)
// This map only governs the manual PATCH /admin/orders/:id/status, which is
// now limited to the non-operational outcomes: cancel and no-show.
const TRANSITIONS: Record<OrderStatusEnum, OrderStatusEnum[]> = {
  [OrderStatusEnum.PENDING_PAYMENT]: [
    OrderStatusEnum.CONFIRMED,
    OrderStatusEnum.CANCELLED,
  ],
  [OrderStatusEnum.CONFIRMED]: [
    OrderStatusEnum.CANCELLED,
    OrderStatusEnum.NO_SHOW,
  ],
  [OrderStatusEnum.CHECKED_IN]: [
    OrderStatusEnum.CANCELLED,
    OrderStatusEnum.NO_SHOW,
  ],
  [OrderStatusEnum.IN_PROGRESS]: [],
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
