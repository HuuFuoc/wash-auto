import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VoucherReasonCodeEnum } from '../types/voucher-reason-code.enum';

/**
 * The single shape every pricing path returns: preview, order creation, and
 * (from Phase 3) payment and the admin order view. One shape from one engine is
 * what stops a customer being quoted one number and charged another.
 *
 * Every figure is an integer number of VND. No floats anywhere.
 */
export class DiscountBreakdownDto {
  @ApiProperty({
    example: 150000,
    description: 'Service price before anything.',
  })
  subtotalVnd: number;

  @ApiProperty({
    example: 150000,
    description:
      'Portion of the subtotal the voucher is allowed to touch. Equal to ' +
      'subtotalVnd when the voucher applies to this order, 0 when the ' +
      "campaign's service/vehicle whitelist excludes it.",
  })
  eligibleAmountVnd: number;

  @ApiProperty({
    example: 15000,
    description: 'Golden-hour window component, after the stacking policy.',
  })
  promotionDiscountVnd: number;

  @ApiProperty({
    example: 7500,
    description: 'Loyalty tier component, after the stacking policy.',
  })
  tierDiscountVnd: number;

  @ApiProperty({ example: 50000, description: 'Voucher component.' })
  voucherDiscountVnd: number;

  @ApiProperty({
    example: 77500,
    description: 'Sum of the three components. Never exceeds subtotalVnd.',
  })
  totalDiscountVnd: number;

  @ApiProperty({
    example: 72500,
    description: 'What the customer pays. Never negative.',
  })
  finalTotalVnd: number;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Set only when a voucher was supplied AND accepted.',
  })
  appliedVoucherId?: string;

  @ApiProperty({
    example: true,
    description:
      'False when a voucher was supplied but rejected. True when the voucher ' +
      'applied, and also when none was supplied at all.',
  })
  voucherAccepted: boolean;

  @ApiPropertyOptional({
    enum: VoucherReasonCodeEnum,
    example: VoucherReasonCodeEnum.ORDER_BELOW_MINIMUM,
    description:
      'Stable code for why the voucher was refused. Branch on THIS, not on ' +
      'the message text.',
  })
  invalidReasonCode?: VoucherReasonCodeEnum;

  @ApiPropertyOptional({
    example: 'Đơn hàng chưa đạt giá trị tối thiểu để dùng voucher',
    description: 'Vietnamese copy matching invalidReasonCode. Display only.',
  })
  invalidReasonMessage?: string;
}
