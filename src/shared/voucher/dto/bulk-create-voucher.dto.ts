import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Bulk-create a batch of unowned "pool" vouchers by quantity. Replaces the
 * one-customer-at-a-time grant flow for campaigns. Each generated voucher is a
 * single-use FREE_WASH code a customer can claim and then redeem.
 */
export class BulkCreateVoucherDto {
  @ApiProperty({
    example: 100,
    minimum: 1,
    maximum: 1000,
    description: 'How many vouchers to generate.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;

  @ApiPropertyOptional({
    example: 'TET2026',
    description:
      'Code prefix (1-15 chars A-Z/0-9). Codes become PREFIX-YYYYMMDD-NNNN. ' +
      'Defaults to WASH.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{1,15}$/, {
    message: 'Prefix chỉ gồm 1-15 ký tự A-Z hoặc 0-9',
  })
  prefix?: string;

  @ApiPropertyOptional({
    example: 100000,
    minimum: 1,
    maximum: 200000,
    default: 100000,
    description: 'Max VND each voucher knocks off a single order.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200_000)
  discountCapVnd?: number;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    description: 'Hard expiry for all vouchers in the batch. Default: 90 days.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
