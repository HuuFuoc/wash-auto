import Redis from 'ioredis';
import { config } from '../config';

/**
 * Shared raw ioredis client — replaces the `REDIS_CLIENT` provider from
 * core/cache/cache.module.ts. Eagerly connects on import (`lazyConnect: false`),
 * mirroring the @Global() CacheModule so consumers (OTP, idempotency) reuse one
 * connection.
 */
export const redisClient = new Redis(config.cache.redisUrl, {
  lazyConnect: false,
});

redisClient.on('connect', () => console.log('[Redis] connected'));
redisClient.on('error', (err: Error) =>
  console.error('[Redis] error', err.message),
);
