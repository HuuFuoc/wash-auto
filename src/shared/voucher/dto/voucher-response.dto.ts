import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VoucherDocument } from '../../../modules/voucher/voucher.model';
import { VoucherStatusEnum } from '../types/voucher-status.enum';
import { VoucherTypeEnum } from '../types/voucher-type.enum';

export class VoucherResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description:
      'Customer display name, populated on admin/manager list responses so ' +
      'the UI can show a name without a separate /admin/users call.',
  })
  customerName?: string;

  @ApiPropertyOptional({ example: 'a@example.com' })
  customerEmail?: string;

  @ApiProperty({ example: 'FREEWASH-20260527-001' })
  code: string;

  @ApiProperty({ enum: VoucherTypeEnum, example: VoucherTypeEnum.FREE_WASH })
  type: VoucherTypeEnum;

  @ApiProperty({
    enum: VoucherStatusEnum,
    example: VoucherStatusEnum.UNUSED,
  })
  status: VoucherStatusEnum;

  @ApiProperty({
    example: 100000,
    description:
      'Maximum VND this voucher can knock off a single order. Final discount ' +
      'is min(originalAmount, discountCapVnd).',
  })
  discountCapVnd: number;

  @ApiProperty({
    example: '2026-08-25T00:00:00.000Z',
    description: 'Hard expiry deadline. After this the voucher is EXPIRED.',
  })
  expiresAt: Date;

  @ApiPropertyOptional({ example: 'Reward for 10 completed washes' })
  grantedReason?: string;

  @ApiPropertyOptional({ example: '2026-06-01T08:00:00.000Z' })
  usedAt?: Date;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  usedOrderId?: string;

  @ApiProperty()
  createdAt: Date;

  static fromDocument(
    doc: VoucherDocument,
    customer?: { name?: string; email?: string },
  ): VoucherResponseDto {
    const dto = new VoucherResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id?.toString() ?? '';
    dto.customerName = customer?.name;
    dto.customerEmail = customer?.email;
    dto.code = doc.code;
    dto.type = doc.type;
    dto.status = doc.status;
    dto.discountCapVnd = doc.discount_cap_vnd;
    dto.expiresAt = doc.expires_at;
    dto.grantedReason = doc.granted_reason;
    dto.usedAt = doc.used_at;
    dto.usedOrderId = doc.used_order_id?.toString();
    const ts = doc as unknown as { created_at: Date };
    dto.createdAt = ts.created_at;
    return dto;
  }
}
