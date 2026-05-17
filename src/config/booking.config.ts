import { registerAs } from '@nestjs/config';

export default registerAs('booking', () => ({
  maxActivePerCustomer: parseInt(
    process.env.MAX_ACTIVE_BOOKINGS_PER_CUSTOMER ?? '3',
    10,
  ),
  maxReschedules: parseInt(process.env.MAX_RESCHEDULES ?? '2', 10),
}));
