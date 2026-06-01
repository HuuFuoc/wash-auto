import { ApiProperty } from '@nestjs/swagger';

/**
 * One bookable start time returned by `GET /me/orders/available-slots`.
 * Pass `scheduledAt` straight into `POST /me/orders` - the server still
 * auto-picks the concrete shift, so the customer never sees shift ids.
 *
 * The discount fields let the FE highlight "golden hour" slots without a
 * second roundtrip per slot.
 */
export class AvailableSlotDto {
  @ApiProperty({
    example: '2026-06-01T09:00:00.000Z',
    description:
      'Bookable start time. Use as `scheduledAt` in POST /me/orders.',
  })
  scheduledAt: Date;

  @ApiProperty({
    example: 3,
    description:
      'Total free capacity across every shift that covers this slot. ' +
      '> 0 means the booking will succeed; capacity can still change ' +
      'before submit, so the POST is the source of truth.',
  })
  remainingCapacity: number;

  @ApiProperty({
    example: true,
    description:
      'True when this start time falls inside an active golden-hour window. ' +
      'Tier discount only applies to slots flagged true.',
  })
  isGoldenHour: boolean;

  @ApiProperty({
    example: 5,
    description:
      "Discount percent the caller's tier would earn if they book this slot. " +
      'Always 0 for slots outside a golden hour, even for high tiers.',
  })
  discountPercent: number;
}
