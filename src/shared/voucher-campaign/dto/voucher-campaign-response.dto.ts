import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VoucherCampaignDocument } from '../../../modules/voucher-campaign/voucher-campaign.model';
import { VoucherSourceEnum } from '../../voucher/types/voucher-source.enum';
import { BenefitTypeEnum } from '../types/benefit-type.enum';
import { CampaignStatusEnum } from '../types/campaign-status.enum';
import { StackingPolicyEnum } from '../types/stacking-policy.enum';

export class VoucherCampaignResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'tet-2026-winback' })
  name: string;

  @ApiProperty({ example: 'Giảm 50K mừng Tết 2026' })
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  terms?: string;

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '#E4572E' })
  themeColor?: string;

  @ApiProperty({ enum: CampaignStatusEnum, example: CampaignStatusEnum.ACTIVE })
  status: CampaignStatusEnum;

  @ApiProperty({ enum: BenefitTypeEnum })
  benefitType: BenefitTypeEnum;

  @ApiProperty({ example: 50000 })
  discountValue: number;

  @ApiPropertyOptional({ example: 100000 })
  discountCapVnd?: number;

  @ApiProperty({ example: 150000 })
  minOrderVnd: number;

  @ApiProperty({ example: '2026-01-20T00:00:00.000Z' })
  validFrom: Date;

  @ApiProperty({ example: '2026-02-20T00:00:00.000Z' })
  validUntil: Date;

  @ApiProperty({ enum: StackingPolicyEnum })
  stackingPolicy: StackingPolicyEnum;

  @ApiPropertyOptional({ example: 1000 })
  maxUsesTotal?: number;

  @ApiProperty({ example: 1 })
  maxUsesPerCustomer: number;

  @ApiPropertyOptional({ example: 50000000 })
  budgetVnd?: number;

  @ApiProperty({ enum: VoucherSourceEnum })
  source: VoucherSourceEnum;

  @ApiPropertyOptional({ example: 'TET2026' })
  publicClaimCode?: string;

  @ApiProperty({
    type: [String],
    description: 'Empty array means every tier qualifies.',
  })
  allowedTierIds: string[];

  @ApiProperty({ type: [String] })
  applicableServiceTypeIds: string[];

  @ApiProperty({ type: [String] })
  applicableVehicleTypeIds: string[];

  @ApiProperty()
  createdAt: Date;

  static fromDocument(
    doc: VoucherCampaignDocument,
  ): VoucherCampaignResponseDto {
    const dto = new VoucherCampaignResponseDto();
    dto.id = doc._id.toString();
    dto.name = doc.name;
    dto.title = doc.title;
    dto.description = doc.description;
    dto.terms = doc.terms;
    dto.imageUrl = doc.image_url;
    dto.themeColor = doc.theme_color;
    dto.status = doc.status;
    dto.benefitType = doc.benefit_type;
    dto.discountValue = doc.discount_value;
    dto.discountCapVnd = doc.discount_cap_vnd;
    dto.minOrderVnd = doc.min_order_vnd;
    dto.validFrom = doc.valid_from;
    dto.validUntil = doc.valid_until;
    dto.stackingPolicy = doc.stacking_policy;
    dto.maxUsesTotal = doc.max_uses_total;
    dto.maxUsesPerCustomer = doc.max_uses_per_customer;
    dto.budgetVnd = doc.budget_vnd;
    dto.source = doc.source;
    dto.publicClaimCode = doc.public_claim_code;
    dto.allowedTierIds = doc.allowed_tier_ids.map((id) => id.toString());
    dto.applicableServiceTypeIds = doc.applicable_service_type_ids.map((id) =>
      id.toString(),
    );
    dto.applicableVehicleTypeIds = doc.applicable_vehicle_type_ids.map((id) =>
      id.toString(),
    );
    const ts = doc as unknown as { created_at: Date };
    dto.createdAt = ts.created_at;
    return dto;
  }
}

export class VoucherCampaignListResponseDto {
  @ApiProperty({ type: [VoucherCampaignResponseDto] })
  data: VoucherCampaignResponseDto[];

  @ApiProperty({
    example: { page: 1, limit: 20, total: 3, totalPages: 1 },
  })
  meta: { page: number; limit: number; total: number; totalPages: number };
}
