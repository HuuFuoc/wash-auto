import { registerAs } from '@nestjs/config';

export default registerAs('booking', () => ({
  maxActivePerCustomer: parseInt(
    process.env.MAX_ACTIVE_BOOKINGS_PER_CUSTOMER ?? '3',
    10,
  ),
  maxReschedules: parseInt(process.env.MAX_RESCHEDULES ?? '2', 10),
  paymentTimeoutMinutes: parseInt(
    process.env.BOOKING_PAYMENT_TIMEOUT_MINUTES ?? '15',
    10,
  ),
  cashArrivalGraceMinutes: parseInt(
    process.env.CASH_ARRIVAL_GRACE_MINUTES ?? '30',
    10,
  ),
  idempotencyTtlSeconds: parseInt(
    process.env.IDEMPOTENCY_TTL_SECONDS ?? '86400',
    10,
  ),
}));
