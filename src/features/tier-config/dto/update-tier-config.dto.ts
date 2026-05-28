import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { VoucherTypeEnum } from '../../voucher/types/voucher-type.enum';

export class UpdateTierConfigDto {
  @ApiPropertyOptional({
    example: 200,
    minimum: 0,
    description:
      'Minimum accumulated loyalty points required to qualify for this tier.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minLoyaltyPoints?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingWindowDays?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priorityLevel?: number;

  @ApiPropertyOptional({
    example: 1.5,
    minimum: 0,
    description: 'Points awarded per 1,000 VND spent (can be fractional).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pointsPer1000Vnd?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 100,
    description:
      'Discount percent applied during golden hours for this tier (0–100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({
    enum: VoucherTypeEnum,
    description:
      'Voucher type minted at the wash milestone for this tier. Omit to ' +
      'keep current; pass null is not supported — disable by leaving the ' +
      'value off (admin endpoint treats undefined as no change).',
  })
  @IsOptional()
  @IsEnum(VoucherTypeEnum)
  voucherTypeOnMilestone?: VoucherTypeEnum;

  @ApiPropertyOptional({
    example: 40000,
    minimum: 0,
    description:
      'Discount cap (VND) baked into the milestone voucher for this tier. ' +
      'Hard upper bound enforced (≤ 200000) so a misconfigured admin grant ' +
      'cannot eat the program economics.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000)
  voucherCapVnd?: number;
}
