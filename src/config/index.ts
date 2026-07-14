import dotenv from 'dotenv';

dotenv.config();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

// Mirrors src/config/database.config.ts (Nest) — same env keys, same URI shape.
// Frontend / Atlas connection string MUST stay identical, so we rebuild it here
// from the same DB_* parts instead of inventing a MONGO_URI key.
const dbUsername = encodeURIComponent(process.env.DB_USERNAME ?? '');
const dbPassword = encodeURIComponent(process.env.DB_PASSWORD ?? '');
const dbHost = process.env.DB_HOST ?? '';
const dbName = process.env.DB_NAME ?? '';

export const config = {
  app: {
    port: toInt(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    globalPrefix: process.env.GLOBAL_API_PREFIX ?? 'api',
  },
  database: {
    uri: `mongodb+srv://${dbUsername}:${dbPassword}@${dbHost}/${dbName}?retryWrites=true&w=majority`,
    name: dbName,
  },
  // Maps src/config/auth.config.ts — keep both access & refresh secrets (Phase 2).
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
  },
  // Maps src/config/otp.config.ts — the verified-email token uses a DIFFERENT
  // secret (JWT_VERIFIED_EMAIL_SECRET) than the access token. Do not conflate.
  otp: {
    ttlSeconds: toInt(process.env.OTP_TTL_SECONDS, 300),
    maxVerifyAttempts: toInt(process.env.OTP_MAX_VERIFY_ATTEMPTS, 5),
    perEmailCooldownSeconds: toInt(
      process.env.OTP_PER_EMAIL_COOLDOWN_SECONDS,
      60,
    ),
    perEmailHourlyLimit: toInt(process.env.OTP_PER_EMAIL_HOURLY_LIMIT, 5),
    verifiedEmailSkipDays: toInt(process.env.OTP_VERIFIED_EMAIL_SKIP_DAYS, 7),
    verifiedEmailSecret: process.env.JWT_VERIFIED_EMAIL_SECRET ?? '',
    verifiedEmailTtl: process.env.JWT_VERIFIED_EMAIL_TTL ?? '15m',
  },
  // Maps src/config/email.config.ts (SMTP transport).
  email: {
    host: process.env.SMTP_HOST ?? '',
    port: toInt(process.env.SMTP_PORT, 465),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  // Maps src/upload/cloudinary.config.ts (image storage).
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
  // Maps src/config/cache.config.ts (Redis used by OTP rate-limit + idempotency).
  cache: {
    redisUrl: process.env.REDIS_URL ?? '',
  },
  // Socket.IO realtime (src/core/realtime.ts). All three default to the safe
  // behaviour, so an existing deployment needs NO new env vars to keep working.
  realtime: {
    // Every emit path targets an authenticated room (`user:` / `role:`), so an
    // anonymous socket can never receive anything — we reject it instead of
    // letting it linger. Flip to `true` only if a client legitimately needs to
    // connect before login.
    allowAnonymous: (process.env.SOCKET_ALLOW_ANONYMOUS ?? 'false') === 'true',
    // Redis adapter: on by default, but a missing REDIS_URL just degrades to
    // single-instance mode (never crashes local dev).
    redisEnabled: (process.env.SOCKET_REDIS_ENABLED ?? 'true') === 'true',
    // Set true in a multi-instance production to fail fast instead of silently
    // dropping cross-instance emits.
    redisRequired: (process.env.SOCKET_REDIS_REQUIRED ?? 'false') === 'true',
  },
  // Maps src/config/booking.config.ts (order/booking rules).
  booking: {
    maxActivePerCustomer: toInt(
      process.env.MAX_ACTIVE_BOOKINGS_PER_CUSTOMER,
      3,
    ),
    maxReschedules: toInt(process.env.MAX_RESCHEDULES, 2),
    paymentTimeoutMinutes: toInt(
      process.env.BOOKING_PAYMENT_TIMEOUT_MINUTES,
      15,
    ),
    cashArrivalGraceMinutes: toInt(process.env.CASH_ARRIVAL_GRACE_MINUTES, 30),
    idempotencyTtlSeconds: toInt(process.env.IDEMPOTENCY_TTL_SECONDS, 86400),
    slotIntervalMinutes: toInt(process.env.BOOKING_SLOT_INTERVAL_MINUTES, 30),
  },
  // Maps src/config/payos.config.ts (online payment).
  payos: {
    clientId: process.env.PAYOS_CLIENT_ID ?? '',
    apiKey: process.env.PAYOS_API_KEY ?? '',
    checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
    returnUrl:
      process.env.PAYOS_RETURN_URL ?? 'http://localhost:3000/payment/success',
    cancelUrl:
      process.env.PAYOS_CANCEL_URL ?? 'http://localhost:3000/payment/cancel',
    webhookUrl: process.env.PAYOS_WEBHOOK_URL ?? '',
  },
  // Maps src/config/gemini.config.ts (chat AI assistant).
  gemini: {
    apiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
    model: (process.env.GEMINI_MODEL ?? 'gemini-2.0-flash').trim(),
  },
} as const;
