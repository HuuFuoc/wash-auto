import * as Joi from 'joi';

/**
 * Joi schema validated by ConfigModule.forRoot. Throws at boot if any
 * required env is missing or fails its rule — never let the app start
 * with a blank JWT secret again.
 */
export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  GLOBAL_API_PREFIX: Joi.string().default('api'),

  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  JWT_VERIFIED_EMAIL_SECRET: Joi.string()
    .min(32)
    .disallow(Joi.ref('JWT_ACCESS_SECRET'))
    .required(),
  JWT_VERIFIED_EMAIL_TTL: Joi.string().default('15m'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  OTP_MAX_VERIFY_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),
  OTP_PER_EMAIL_COOLDOWN_SECONDS: Joi.number().integer().min(30).default(60),
  OTP_PER_EMAIL_HOURLY_LIMIT: Joi.number().integer().min(1).max(20).default(5),
  OTP_VERIFIED_EMAIL_SKIP_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(7),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().required(),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(true),
  SMTP_USER: Joi.string().email().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),

  PAYOS_CLIENT_ID: Joi.string().required(),
  PAYOS_API_KEY: Joi.string().required(),
  PAYOS_CHECKSUM_KEY: Joi.string().required(),
  PAYOS_RETURN_URL: Joi.string().uri().required(),
  PAYOS_CANCEL_URL: Joi.string().uri().required(),

  MAX_ACTIVE_BOOKINGS_PER_CUSTOMER: Joi.number()
    .integer()
    .min(1)
    .default(3),
  MAX_RESCHEDULES: Joi.number().integer().min(0).default(2),
  BOOKING_PAYMENT_TIMEOUT_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(60)
    .default(15),
  IDEMPOTENCY_TTL_SECONDS: Joi.number()
    .integer()
    .min(3600)
    .default(86400),
});
