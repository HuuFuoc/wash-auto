import type Redis from 'ioredis';
import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import { redisClient } from '../../core/redis';

export interface IRefreshTokenPayload {
  sub: string;
  jti: string;
  exp: number;
}

export interface ISignedRefreshToken {
  token: string;
  jti: string;
}

// Was features/auth/services/refresh-token.service.ts. JwtService → jsonwebtoken,
// REDIS_CLIENT → shared redisClient. Blacklist of revoked jti lives in Redis.
export class RefreshTokenService {
  private static readonly BLACKLIST_PREFIX = 'refresh:bl:';

  constructor(private readonly redis: Redis = redisClient) {}

  sign(userId: string): Promise<ISignedRefreshToken> {
    const jti = randomUUID();
    const token = jwt.sign({ sub: userId, jti }, config.auth.refreshSecret, {
      expiresIn: config.auth.refreshTtl as SignOptions['expiresIn'],
    });
    return Promise.resolve({ token, jti });
  }

  verify(token: string): Promise<IRefreshTokenPayload> {
    return Promise.resolve(
      jwt.verify(token, config.auth.refreshSecret) as IRefreshTokenPayload,
    );
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(jti));
    return result === 1;
  }

  async blacklist(jti: string, expEpochSeconds: number): Promise<void> {
    const ttl = expEpochSeconds - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    await this.redis.set(this.key(jti), '1', 'EX', ttl);
  }

  private key(jti: string): string {
    return `${RefreshTokenService.BLACKLIST_PREFIX}${jti}`;
  }
}
