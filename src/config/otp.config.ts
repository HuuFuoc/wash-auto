import { registerAs } from '@nestjs/config';

export default registerAs('otp', () => ({
  ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '300', 10),
  maxVerifyAttempts: parseInt(process.env.OTP_MAX_VERIFY_ATTEMPTS ?? '5', 10),
  perEmailCooldownSeconds: parseInt(
    process.env.OTP_PER_EMAIL_COOLDOWN_SECONDS ?? '60',
    10,
  ),
  perEmailHourlyLimit: parseInt(
    process.env.OTP_PER_EMAIL_HOURLY_LIMIT ?? '5',
    10,
  ),
  verifiedEmailSkipDays: parseInt(
    process.env.OTP_VERIFIED_EMAIL_SKIP_DAYS ?? '7',
    10,
  ),
  verifiedEmailSecret: process.env.JWT_VERIFIED_EMAIL_SECRET ?? '',
  verifiedEmailTtl: process.env.JWT_VERIFIED_EMAIL_TTL ?? '15m',
}));
