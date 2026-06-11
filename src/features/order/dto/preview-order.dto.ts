import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsMongoId, IsOptional } from 'class-validator';

/**
 * Body of `POST /me/orders/preview`. Customer asks the server what the
 * final price would be for a given (service, time, voucher) tuple WITHOUT
 * committing the booking. Voucher consumption is NOT performed - the same
 * voucher remains UNUSED until the real POST /me/orders.
 */
export class PreviewOrderDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Vehicle type to price for. Price + duration come from the matching ' +
      'service × vehicle-type cell; an inapplicable combo is rejected.',
  })
  @IsMongoId()
  vehicleTypeId: string;

  @ApiProperty({ example: '2026-06-01T01:30:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Optional voucher id to simulate. Must be owned and UNUSED. Voucher ' +
      'is NOT consumed by this call.',
  })
  @IsOptional()
  @IsMongoId()
  voucherId?: string;
}

/**
 * Response of `POST /me/orders/preview`. Every figure here is what the
 * customer would actually be charged if they submitted the same body to
 * `POST /me/orders` right now. The FE uses it to render a "you save Xđ"
 * card before the customer commits.
 */
export class PreviewOrderResponseDto {
  @ApiProperty({
    example: 150000,
    description: 'Service price for this vehicle type (before discounts).',
  })
  originalAmount: number;

  @ApiProperty({
    example: 30,
    description: 'Wash duration (minutes) for this service × vehicle type.',
  })
  estimatedMinutes: number;

  @ApiProperty({
    example: 15000,
    description:
      'VND knocked off `originalAmount` by tier discount + voucher cap.',
  })
  discountAmount: number;

  @ApiProperty({
    example: 10,
    description: 'discountAmount as a rounded percent of originalAmount.',
  })
  discountPercent: number;

  @ApiPropertyOptional({
    example: 'golden_hour:Bronze+voucher:FREEWASH-20260527-001',
    description:
      'Human-readable breakdown of what made up the discount. Empty when ' +
      'no discount applied.',
  })
  discountReason?: string;

  @ApiProperty({
    example: 135000,
    description: 'What the customer actually pays.',
  })
  amount: number;

  @ApiProperty({
    example: true,
    description:
      'Whether scheduledAt falls inside an active golden-hour window. ' +
      'The tier discount only applies when this is true.',
  })
  isGoldenHour: boolean;

  @ApiProperty({
    example: 'Bronze',
    description: "Customer's current loyalty tier.",
  })
  tierName: string;

  @ApiProperty({
    example: 5,
    description:
      'Discount percent the tier earns INSIDE a golden hour window. 0 outside.',
  })
  tierDiscountPercent: number;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Max VND the supplied voucher could knock off this order. Omitted when ' +
      'no voucher was supplied or when it was rejected.',
  })
  voucherDiscountCapVnd?: number;

  @ApiPropertyOptional({
    example: 'Voucher is expired',
    description:
      'Set when the supplied voucherId was rejected (expired, not owned, ' +
      'already used). Discount fields ignore the voucher in that case.',
  })
  voucherError?: string;
}
