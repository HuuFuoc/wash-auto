import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VoucherCampaignDocument } from '../../../modules/voucher-campaign/voucher-campaign.model';
import { BenefitTypeEnum } from '../types/benefit-type.enum';
import { CampaignStatusEnum } from '../types/campaign-status.enum';
import { StackingPolicyEnum } from '../types/stacking-policy.enum';

/**
 * The customer-safe view of a campaign: enough to render a voucher card and
 * explain the rules, and nothing more.
 *
 * Deliberately OMITTED, because they are commercial internals a customer has no
 * business seeing: `budget_vnd`, `redeemed_vnd`, `redeemed_count`,
 * `max_uses_total`, `created_by`, `source`, and the internal `name`. Knowing a
 * campaign has 2M VND of budget left is an invitation to drain it.
 *
 * `public_claim_code` is also omitted: a customer reaches a targeted campaign by
 * being given its code, so echoing codes back would turn any campaign lookup
 * into a way to claim from promotions you were never sent.
 */
export class VoucherCampaignPublicDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'Giảm 50K mừng Tết 2026' })
  title: string;

  @ApiPropertyOptional({ example: 'Áp dụng cho mọi gói rửa xe trong tháng 1.' })
  description?: string;

  @ApiPropertyOptional({ example: 'Không áp dụng cùng ưu đãi khác.' })
  terms?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/tet2026.png' })
  imageUrl?: string;

  @ApiPropertyOptional({
    example: '#E4572E',
    description: 'Hex colour to theme the voucher card with.',
  })
  themeColor?: string;

  @ApiProperty({
    enum: CampaignStatusEnum,
    example: CampaignStatusEnum.ACTIVE,
    description:
      'Only ACTIVE campaigns can actually be redeemed. PAUSED is surfaced so ' +
      'the UI can say "tạm dừng" instead of silently failing at checkout.',
  })
  status: CampaignStatusEnum;

  @ApiProperty({ enum: BenefitTypeEnum })
  benefitType: BenefitTypeEnum;

  @ApiProperty({
    example: 50000,
    description: 'VND for fixed_amount; percent for percent_off.',
  })
  discountValue: number;

  @ApiPropertyOptional({ example: 100000 })
  discountCapVnd?: number;

  @ApiProperty({
    example: 150000,
    description: 'Order subtotal required before the voucher applies.',
  })
  minOrderVnd: number;

  @ApiProperty({ example: '2026-01-20T00:00:00.000Z' })
  validFrom: Date;

  @ApiProperty({ example: '2026-02-20T00:00:00.000Z' })
  validUntil: Date;

  @ApiProperty({
    enum: StackingPolicyEnum,
    description:
      'Lets the UI warn "không dùng chung ưu đãi khác" before checkout.',
  })
  stackingPolicy: StackingPolicyEnum;

  @ApiProperty({
    type: [String],
    description:
      'Tier config ids this campaign is limited to. EMPTY = every tier ' +
      'qualifies. Join against GET /tier-configs for display names.',
  })
  allowedTierIds: string[];

  @ApiProperty({
    type: [String],
    description:
      'EMPTY = every service qualifies. Join against GET /service-types.',
  })
  applicableServiceTypeIds: string[];

  @ApiProperty({
    type: [String],
    description:
      'EMPTY = every vehicle type qualifies. Join against GET /vehicle-types.',
  })
  applicableVehicleTypeIds: string[];

  static fromDocument(doc: VoucherCampaignDocument): VoucherCampaignPublicDto {
    const dto = new VoucherCampaignPublicDto();
    dto.id = doc._id.toString();
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
    // `?? []` rather than a bare `.map`: a projected or pre-schema document can
    // arrive without these arrays, and an empty list is exactly the right
    // answer anyway — it means "no restriction".
    dto.allowedTierIds = (doc.allowed_tier_ids ?? []).map((id) =>
      id.toString(),
    );
    dto.applicableServiceTypeIds = (doc.applicable_service_type_ids ?? []).map(
      (id) => id.toString(),
    );
    dto.applicableVehicleTypeIds = (doc.applicable_vehicle_type_ids ?? []).map(
      (id) => id.toString(),
    );
    return dto;
  }
}

/** Paginated envelope for `GET /voucher-campaigns`. */
export class VoucherCampaignPublicListResponseDto {
  @ApiProperty({ type: [VoucherCampaignPublicDto] })
  data: VoucherCampaignPublicDto[];

  @ApiProperty({ example: { page: 1, limit: 20, total: 3, totalPages: 1 } })
  meta: { page: number; limit: number; total: number; totalPages: number };
}
