import { ApiProperty } from '@nestjs/swagger';

/**
 * One bookable start time returned by `GET /me/orders/available-slots`.
 * Pass `scheduledAt` straight into `POST /me/orders` — the server still
 * auto-picks the concrete shift, so the customer never sees shift ids.
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
}
