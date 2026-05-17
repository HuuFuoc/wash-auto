import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { IVerifiedEmailPayload } from '../types/verified-email-payload.type';

interface ICachedResponse {
  status: number;
  body: unknown;
}

/**
 * Caches the full response body for the tuple (userId, Idempotency-Key)
 * for IDEMPOTENCY_TTL_SECONDS (default 24h). A retry with the same key —
 * common after network blips — replays the cached response instead of
 * re-executing the handler. Without a key, the interceptor is a no-op.
 *
 * Must run AFTER an auth guard so req.user is populated.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly HEADER = 'idempotency-key';
  private static readonly KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const rawKey = req.headers[IdempotencyInterceptor.HEADER];
    if (rawKey === undefined || rawKey === '') return next.handle();
    if (
      Array.isArray(rawKey) ||
      !IdempotencyInterceptor.KEY_PATTERN.test(rawKey)
    ) {
      return next.handle();
    }
    const user = req.user as IVerifiedEmailPayload | undefined;
    if (!user?.sub) return next.handle();

    const cacheKey = `idem:user:${user.sub}:${rawKey}`;
    const ttl = this.config.getOrThrow<number>('booking.idempotencyTtlSeconds');

    return from(this.redis.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          try {
            const parsed = JSON.parse(cached) as ICachedResponse;
            res.status(parsed.status);
            res.setHeader('Idempotent-Replayed', 'true');
            return of(parsed.body);
          } catch {
            // fall through to fresh execution
          }
        }
        return next.handle().pipe(
          tap((body: unknown) => {
            const status = res.statusCode;
            const payload: ICachedResponse = { status, body };
            void this.redis
              .set(cacheKey, JSON.stringify(payload), 'EX', ttl, 'NX')
              .catch((err: Error) =>
                this.logger.error(
                  `Idempotency cache write failed: ${err.message}`,
                ),
              );
          }),
        );
      }),
    );
  }
}
