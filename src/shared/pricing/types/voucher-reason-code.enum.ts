/**
 * Stable machine-readable reasons a voucher was refused.
 *
 * Clients branch on the CODE, never on the message: messages are Vietnamese
 * copy that marketing rewrites freely, while these values are an API contract.
 */
export enum VoucherReasonCodeEnum {
  VOUCHER_NOT_FOUND = 'VOUCHER_NOT_FOUND',
  VOUCHER_NOT_OWNED = 'VOUCHER_NOT_OWNED',
  VOUCHER_NOT_ACTIVE = 'VOUCHER_NOT_ACTIVE',
  VOUCHER_EXPIRED = 'VOUCHER_EXPIRED',
  VOUCHER_REVOKED = 'VOUCHER_REVOKED',
  VOUCHER_ALREADY_USED = 'VOUCHER_ALREADY_USED',
  /** Held for a different in-flight order. */
  VOUCHER_RESERVED = 'VOUCHER_RESERVED',
  CAMPAIGN_NOT_ACTIVE = 'CAMPAIGN_NOT_ACTIVE',
  ORDER_BELOW_MINIMUM = 'ORDER_BELOW_MINIMUM',
  TIER_NOT_ELIGIBLE = 'TIER_NOT_ELIGIBLE',
  SERVICE_NOT_ELIGIBLE = 'SERVICE_NOT_ELIGIBLE',
  VEHICLE_NOT_ELIGIBLE = 'VEHICLE_NOT_ELIGIBLE',
  USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED',
  CAMPAIGN_BUDGET_EXCEEDED = 'CAMPAIGN_BUDGET_EXCEEDED',
  STACKING_NOT_ALLOWED = 'STACKING_NOT_ALLOWED',
}

/**
 * Default Vietnamese copy per code. A caller may override for a richer message
 * (e.g. interpolating the actual minimum), but every code always has something
 * user-facing so the UI never has to invent wording.
 */
export const VOUCHER_REASON_MESSAGE: Record<VoucherReasonCodeEnum, string> = {
  [VoucherReasonCodeEnum.VOUCHER_NOT_FOUND]: 'Không tìm thấy voucher',
  [VoucherReasonCodeEnum.VOUCHER_NOT_OWNED]:
    'Voucher này không thuộc về tài khoản của bạn',
  [VoucherReasonCodeEnum.VOUCHER_NOT_ACTIVE]: 'Voucher chưa đến ngày sử dụng',
  [VoucherReasonCodeEnum.VOUCHER_EXPIRED]: 'Voucher đã hết hạn',
  [VoucherReasonCodeEnum.VOUCHER_REVOKED]: 'Voucher đã bị thu hồi',
  [VoucherReasonCodeEnum.VOUCHER_ALREADY_USED]: 'Voucher đã được sử dụng',
  [VoucherReasonCodeEnum.VOUCHER_RESERVED]:
    'Voucher đang được giữ cho một đơn khác của bạn',
  [VoucherReasonCodeEnum.CAMPAIGN_NOT_ACTIVE]:
    'Chương trình ưu đãi này hiện không áp dụng',
  [VoucherReasonCodeEnum.ORDER_BELOW_MINIMUM]:
    'Đơn hàng chưa đạt giá trị tối thiểu để dùng voucher',
  [VoucherReasonCodeEnum.TIER_NOT_ELIGIBLE]:
    'Voucher này chỉ dành cho hạng thành viên khác',
  [VoucherReasonCodeEnum.SERVICE_NOT_ELIGIBLE]:
    'Voucher không áp dụng cho dịch vụ này',
  [VoucherReasonCodeEnum.VEHICLE_NOT_ELIGIBLE]:
    'Voucher không áp dụng cho loại xe này',
  [VoucherReasonCodeEnum.USAGE_LIMIT_REACHED]:
    'Bạn đã dùng hết lượt của chương trình này',
  [VoucherReasonCodeEnum.CAMPAIGN_BUDGET_EXCEEDED]:
    'Chương trình ưu đãi đã hết ngân sách',
  [VoucherReasonCodeEnum.STACKING_NOT_ALLOWED]:
    'Voucher này không dùng chung với ưu đãi khác',
};
