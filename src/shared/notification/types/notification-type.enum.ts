/** Loại thông báo — dùng để chọn icon/màu ở FE và lọc nếu cần. */
export enum NotificationTypeEnum {
  ORDER_CREATED = 'order_created',
  WASH_ASSIGNED = 'wash_assigned',
  WASH_STARTED = 'wash_started',
  WASH_COMPLETED = 'wash_completed',
  FEEDBACK_CREATED = 'feedback_created',

  // ─── voucher ───────────────────────────────────────────────────────────────
  VOUCHER_GRANTED = 'voucher_granted',
  VOUCHER_CLAIMED = 'voucher_claimed',
  VOUCHER_EXPIRING = 'voucher_expiring',
  VOUCHER_USED = 'voucher_used',
  VOUCHER_REVOKED = 'voucher_revoked',

  // ─── loyalty ───────────────────────────────────────────────────────────────
  TIER_UPGRADED = 'tier_upgraded',
  TIER_NEAR_UPGRADE = 'tier_near_upgrade',
  VOUCHER_MILESTONE_NEAR = 'voucher_milestone_near',
  LOYALTY_RESET_WARNING = 'loyalty_reset_warning',
  LOYALTY_RESET_DONE = 'loyalty_reset_done',
}
