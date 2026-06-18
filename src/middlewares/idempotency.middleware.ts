import { NextFunction, Response } from 'express';
import { config } from '../config';
import { redisClient } from '../core/redis';
import { AuthRequest } from './auth.middleware';

const HEADER = 'idempotency-key';
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

interface ICachedResponse {
  status: number;
  body: unknown;
}

/**
 * Express equivalent of IdempotencyInterceptor. Caches the full response body
 * for the tuple (userId, Idempotency-Key) for `booking.idempotencyTtlSeconds`
 * (default 24h). A retry with the same key replays the cached response instead
 * of re-executing the handler. Without a (valid) key, or before auth populates
 * `req.user`, it is a no-op. MUST run AFTER authMiddleware.
 *
 * The response body is captured by wrapping `res.json` (controllers reply with
 * `res.json(...)`), mirroring how the Nest interceptor tapped the handler's
 * return value.
 */
export function idempotencyMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const rawKey = req.headers[HEADER];
  if (rawKey === undefined || rawKey === '') return next();
  if (Array.isArray(rawKey) || !KEY_PATTERN.test(rawKey)) return next();
  const sub = req.user?.sub;
  if (!sub) return next();

  const cacheKey = `idem:user:${sub}:${rawKey}`;
  const ttl = config.booking.idempotencyTtlSeconds;

  redisClient
    .get(cacheKey)
    .then((cached) => {
      if (cached !== null) {
        try {
          const parsed = JSON.parse(cached) as ICachedResponse;
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(parsed.status).json(parsed.body);
          return;
        } catch {
          // fall through to fresh execution
        }
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: unknown): Response => {
        const payload: ICachedResponse = { status: res.statusCode, body };
        void redisClient
          .set(cacheKey, JSON.stringify(payload), 'EX', ttl, 'NX')
          .catch((err: Error) =>
            console.error(`Idempotency cache write failed: ${err.message}`),
          );
        return originalJson(body);
      }) as Response['json'];

      next();
    })
    .catch(next);
}
