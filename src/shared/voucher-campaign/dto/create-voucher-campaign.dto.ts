import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsHexColor,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VoucherSourceEnum } from '../../voucher/types/voucher-source.enum';
import { BenefitTypeEnum } from '../types/benefit-type.enum';
import { StackingPolicyEnum } from '../types/stacking-policy.enum';

/**
 * Creates a campaign in DRAFT. Nothing is issued until it is activated, so the
 * validation here is about internal consistency of the rules rather than about
 * protecting live customers.
 *
 * Cross-field rules that class-validator cannot express (valid_from before
 * valid_until, FREE_SERVICE needing a service whitelist) are enforced in
 * VoucherCampaignService.assertCoherent so both create and update share them.
 */
export class CreateVoucherCampaignDto {
  @ApiProperty({ example: 'tet-2026-winback', description: 'Internal name.' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Giảm 50K mừng Tết 2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Áp dụng cho mọi gói rửa xe trong tháng 1.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Không áp dụng cùng ưu đãi khác.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/tet2026.png' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '#E4572E' })
  @IsOptional()
  @IsHexColor()
  themeColor?: string;

  @ApiProperty({ enum: BenefitTypeEnum, example: BenefitTypeEnum.FIXED_AMOUNT })
  @IsEnum(BenefitTypeEnum)
  benefitType: BenefitTypeEnum;

  @ApiProperty({
    example: 50000,
    description:
      'VND for fixed_amount, percent 1-100 for percent_off. Ignored by ' +
      'free_service, which always covers the whole eligible service.',
  })
  @ValidateIf(
    (o: CreateVoucherCampaignDto) =>
      o.benefitType !== BenefitTypeEnum.FREE_SERVICE,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ValidateIf(
    (o: CreateVoucherCampaignDto) =>
      o.benefitType === BenefitTypeEnum.PERCENT_OFF,
  )
  @Max(100, { message: 'percent_off: discountValue phải trong khoảng 1-100' })
  discountValue: number;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Ceiling in VND. Meaningful for percent_off. Omit = uncapped.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  discountCapVnd?: number;

  @ApiPropertyOptional({ example: 150000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderVnd?: number;

  @ApiProperty({ example: '2026-01-20T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  validFrom: Date;

  @ApiProperty({ example: '2026-02-20T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  validUntil: Date;

  @ApiPropertyOptional({
    enum: StackingPolicyEnum,
    default: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
  })
  @IsOptional()
  @IsEnum(StackingPolicyEnum)
  stackingPolicy?: StackingPolicyEnum;

  @ApiPropertyOptional({ example: 1000, description: 'Omit = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesTotal?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;

  @ApiPropertyOptional({ example: 50000000, description: 'Omit = unbudgeted.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  budgetVnd?: number;

  @ApiPropertyOptional({
    enum: VoucherSourceEnum,
    default: VoucherSourceEnum.CAMPAIGN,
  })
  @IsOptional()
  @IsEnum(VoucherSourceEnum)
  source?: VoucherSourceEnum;

  @ApiPropertyOptional({
    example: 'TET2026',
    description:
      'Code customers type to claim from this pool. Must be unique across ' +
      'campaigns. Omit for grant-only campaigns.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{3,20}$/, {
    message: 'publicClaimCode chỉ gồm 3-20 ký tự A-Z hoặc 0-9',
  })
  publicClaimCode?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Tier config ids. EMPTY / omitted = every tier qualifies.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  allowedTierIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Service type ids. EMPTY / omitted = every service qualifies.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  applicableServiceTypeIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Vehicle type ids. EMPTY / omitted = every vehicle qualifies.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  applicableVehicleTypeIds?: string[];
}
