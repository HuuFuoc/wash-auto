import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../core/redis';

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

function makeLimiter(windowMs: number, limit: number, prefix: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key by client IP (mirrors the throttler's per-IP tracker) and
    // avoids express-rate-limit's trust-proxy validation noise.
    keyGenerator: (req) => req.ip ?? 'unknown',
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
