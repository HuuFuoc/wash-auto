import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VoucherDocument } from '../../../modules/voucher/voucher.model';
import { VoucherCampaignDocument } from '../../../modules/voucher-campaign/voucher-campaign.model';
import { VoucherCampaignPublicDto } from '../../voucher-campaign/dto/voucher-campaign-public.dto';
import { VoucherSourceEnum } from '../types/voucher-source.enum';
import { VoucherStatusEnum } from '../types/voucher-status.enum';
import { VoucherTypeEnum } from '../types/voucher-type.enum';

export class VoucherResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Campaign whose rules govern this voucher. Absent only on rows the ' +
      'backfill migration has not reached.',
  })
  campaignId?: string;

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

  @ApiPropertyOptional({
    enum: VoucherSourceEnum,
    example: VoucherSourceEnum.LOYALTY_MILESTONE,
    description:
      'Acquisition channel. Absent on vouchers minted before this was tracked.',
  })
  grantedSource?: VoucherSourceEnum;

  @ApiPropertyOptional({ example: '2026-05-27T08:00:00.000Z' })
  grantedAt?: Date;

  @ApiPropertyOptional({ example: '2026-06-01T08:00:00.000Z' })
  usedAt?: Date;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  usedOrderId?: string;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Set while status is RESERVED: the order holding this voucher.',
  })
  reservedOrderId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T08:15:00.000Z',
    description: 'When the reservation lapses and the voucher is released.',
  })
  reservedUntil?: Date;

  @ApiPropertyOptional({ example: '2026-06-02T09:00:00.000Z' })
  revokedAt?: Date;

  @ApiPropertyOptional({
    example: 'Granted to the wrong customer',
    description: 'Admin-supplied justification, set together with revokedAt.',
  })
  revokeReason?: string;

  @ApiPropertyOptional({
    type: VoucherCampaignPublicDto,
    description:
      'Presentation + rules of the campaign this voucher belongs to, embedded ' +
      'so a wallet screen can render every card from ONE request instead of ' +
      'firing a lookup per voucher. Absent on rows the backfill has not ' +
      'reached, and on any response the caller did not ask to enrich.',
  })
  campaign?: VoucherCampaignPublicDto;

  @ApiProperty()
  createdAt: Date;

  static fromDocument(
    doc: VoucherDocument,
    customer?: { name?: string; email?: string },
    campaign?: VoucherCampaignDocument | null,
  ): VoucherResponseDto {
    const dto = new VoucherResponseDto();
    dto.id = doc._id.toString();
    dto.campaignId = doc.campaign_id?.toString();
    dto.customerId = doc.customer_id?.toString() ?? '';
    dto.customerName = customer?.name;
    dto.customerEmail = customer?.email;
    dto.code = doc.code;
    dto.type = doc.type;
    dto.status = doc.status;
    dto.discountCapVnd = doc.discount_cap_vnd;
    dto.expiresAt = doc.expires_at;
    dto.grantedReason = doc.granted_reason;
    dto.grantedSource = doc.granted_source;
    dto.grantedAt = doc.granted_at;
    dto.usedAt = doc.used_at;
    dto.usedOrderId = doc.used_order_id?.toString();
    dto.reservedOrderId = doc.reserved_order_id?.toString();
    dto.reservedUntil = doc.reserved_until;
    dto.revokedAt = doc.revoked_at;
    dto.revokeReason = doc.revoke_reason;
    dto.campaign = campaign
      ? VoucherCampaignPublicDto.fromDocument(campaign)
      : undefined;
    const ts = doc as unknown as { created_at: Date };
    dto.createdAt = ts.created_at;
    return dto;
  }
}
