export enum VoucherStatusEnum {
  UNUSED = 'unused',
  USED = 'used',
  EXPIRED = 'expired',
}

/** Status values a voucher can be redeemed from. */
export const REDEEMABLE_VOUCHER_STATUSES: VoucherStatusEnum[] = [
  VoucherStatusEnum.UNUSED,
];
