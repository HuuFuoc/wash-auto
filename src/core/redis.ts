import Redis from 'ioredis';
import { config } from '../config';

/**
 * Shared raw ioredis client — replaces the `REDIS_CLIENT` provider from
 * core/cache/cache.module.ts. Eagerly connects on import (`lazyConnect: false`),
 * mirroring the @Global() CacheModule so consumers (OTP, idempotency) reuse one
 * connection.
 *
 * Under jest the eager connection outlives the test run and fires
 * connect/error logs after teardown ("Cannot log after tests are done"), so
 * tests get a lazy client instead — it only connects if a spec actually
 * issues a command (none do today; they mock or inject their own client).
 */
export const redisClient = new Redis(config.cache.redisUrl, {
  lazyConnect: process.env.JEST_WORKER_ID !== undefined,
});

redisClient.on('connect', () => console.log('[Redis] connected'));
redisClient.on('error', (err: Error) =>
  console.error('[Redis] error', err.message),
);
