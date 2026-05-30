import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin/manager-issued voucher grant. Used for service-recovery comps,
 * marketing campaigns, or one-off promotions. The cap is hard-capped at
 * 200k VND in the DTO layer so a single typo cannot blow up the program
 * economics — anything bigger needs a code change, not a runtime field.
 */
export class GrantVoucherAdminDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Customer who receives the voucher.',
  })
  @IsMongoId()
  customerId: string;

  @ApiPropertyOptional({
    example: 100000,
    minimum: 1,
    maximum: 200000,
    default: 100000,
    description:
      'Max VND the voucher can knock off a single order. Omit to use the ' +
      'program default (100k). Capped at 200k to avoid runaway grants.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200_000)
  discountCapVnd?: number;

  @ApiPropertyOptional({
    example: '2026-08-27T00:00:00.000Z',
    description:
      'Hard expiry deadline. Omit to use the program default (90 days from now).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiProperty({
    example: 'Service recovery for late wash on order #1234',
    minLength: 5,
    maxLength: 500,
    description:
      'Required audit trail. Shows up on the voucher detail and in the ' +
      'log line so support can explain why this voucher was issued.',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
