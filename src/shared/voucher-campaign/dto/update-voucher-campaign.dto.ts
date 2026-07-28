import { ApiPropertyOptional } from '../../../common/swagger-shim';
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
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BenefitTypeEnum } from '../types/benefit-type.enum';
import { StackingPolicyEnum } from '../types/stacking-policy.enum';

/**
 * Partial edit of a campaign. Every field is optional, so the cross-field rules
 * are checked in the service against the MERGED document rather than here —
 * validating a patch in isolation would let `benefitType: percent_off` through
 * while `discountValue` stayed at 50000.
 *
 * `status` is intentionally absent: lifecycle moves through the explicit
 * activate/pause/end endpoints so each transition can be guarded.
 */
export class UpdateVoucherCampaignDto {
  @ApiPropertyOptional({ example: 'tet-2026-winback' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Giảm 50K mừng Tết 2026' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '#E4572E' })
  @IsOptional()
  @IsHexColor()
  themeColor?: string;

  @ApiPropertyOptional({ enum: BenefitTypeEnum })
  @IsOptional()
  @IsEnum(BenefitTypeEnum)
  benefitType?: BenefitTypeEnum;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  discountValue?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  discountCapVnd?: number;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderVnd?: number;

  @ApiPropertyOptional({ example: '2026-01-20T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @ApiPropertyOptional({ example: '2026-02-20T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @ApiPropertyOptional({ enum: StackingPolicyEnum })
  @IsOptional()
  @IsEnum(StackingPolicyEnum)
  stackingPolicy?: StackingPolicyEnum;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesTotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;

  @ApiPropertyOptional({ example: 50000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  budgetVnd?: number;

  @ApiPropertyOptional({ example: 'TET2026' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{3,20}$/, {
    message: 'publicClaimCode chỉ gồm 3-20 ký tự A-Z hoặc 0-9',
  })
  publicClaimCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  allowedTierIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  applicableServiceTypeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  applicableVehicleTypeIds?: string[];
}
