import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../core/redis';
import type { AuthRequest } from './auth.middleware';

/**
 * Rate-limiting parity with Nest's @nestjs/throttler.
 *  - Global: ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]) → 60 req / 60s / IP.
 *  - Chat:   @Throttle({ default: { ttl: 60_000, limit: 20 } }) on POST /chat/message.
 *
 * Backed by Redis (rate-limit-redis over the shared ioredis client) — NOT
 * in-memory: on Vercel each invocation is a fresh instance, so an in-memory
 * store would reset constantly and leak the limit. Keys are namespaced
 * (rl:global: / rl:chat:) with TTL = the window.
 *
 * 429 body matches Nest's ThrottlerException exactly: the exception wraps a
 * string message, so the filter emits `{ statusCode, message }` (no `error`).
 */
const THROTTLER_MESSAGE = 'ThrottlerException: Too Many Requests';

function makeLimiter(
  windowMs: number,
  limit: number,
  prefix: string,
  // Custom key by client IP (mirrors the throttler's per-IP tracker) and
  // avoids express-rate-limit's trust-proxy validation noise.
  keyGenerator: (req: Request) => string = (req) => req.ip ?? 'unknown',
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    validate: false,
    store: new RedisStore({
      prefix,
      // ioredis .call returns Promise<unknown>; rate-limit-redis wants
      // Promise<RedisReply> — cast through any to bridge the lib types.
      sendCommand: (...args: string[]) =>
        redisClient.call(args[0], ...args.slice(1)) as Promise<any>,
    }),
    handler: (_req, res) => {
      res.status(429).json({ statusCode: 429, message: THROTTLER_MESSAGE });
    },
  });
}

export const globalRateLimiter = makeLimiter(60_000, 60, 'rl:global:');
export const chatRateLimiter = makeLimiter(60_000, 20, 'rl:chat:');

/**
 * Voucher claim: 10 attempts / 10 min, keyed by ACCOUNT rather than IP.
 *
 * Codes are random now, but a determined scraper can still walk the space, and
 * per-IP limiting is the wrong tracker for that — one office NAT shares an IP
 * across honest customers, while an attacker rotates IPs freely. The account is
 * the scarce resource (it needs a verified email), so that is what we meter.
 * Falls back to IP for the unauthenticated case, which the route should never
 * see since authMiddleware runs first.
 *
 * A legitimate customer types one code at a time; 10 misses in 10 minutes is
 * already far past "fat-fingered it twice".
 */
export const voucherClaimRateLimiter = makeLimiter(
  10 * 60_000,
  10,
  'rl:voucher-claim:',
  (req) => (req as AuthRequest).user?.sub ?? req.ip ?? 'unknown',
);

/**
 * Forgot-password: 5 requests / hour, keyed by the EMAIL being reset.
 *
 * Per-email rather than per-IP for two reasons. It caps how many reset mails one
 * address can be made to receive no matter how many IPs the sender rotates
 * through, and — more importantly — it keeps the throttle out of the service,
 * where it could only fire for addresses that actually have an account. A 429
 * that only real accounts can trigger is an enumeration oracle; applying it here,
 * before the lookup, makes the response identical either way.
 *
 * Must be mounted AFTER validateDto so the key is the normalised (trimmed,
 * lower-cased) address and cannot be split into buckets by casing alone.
 */
export const passwordResetRateLimiter = makeLimiter(
  60 * 60_000,
  5,
  'rl:password-reset:',
  (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' && email.length > 0
      ? email
      : (req.ip ?? 'unknown');
  },
);
