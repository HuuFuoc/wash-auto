import type Redis from 'ioredis';
import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import { redisClient } from '../../core/redis';

export interface IRefreshTokenPayload {
  sub: string;
  jti: string;
  exp: number;
  /** Auto-stamped by jsonwebtoken. Compared against the per-user revoke cutoff. */
  iat: number;
}

export interface ISignedRefreshToken {
  token: string;
  jti: string;
}

// Was features/auth/services/refresh-token.service.ts. JwtService → jsonwebtoken,
// REDIS_CLIENT → shared redisClient. Blacklist of revoked jti lives in Redis.
export class RefreshTokenService {
  private static readonly BLACKLIST_PREFIX = 'refresh:bl:';
  private static readonly CUTOFF_PREFIX = 'refresh:cutoff:';

  private cachedTtlSeconds: number | null = null;

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

  /**
   * Invalidates every refresh token issued to this user before now, without
   * needing to know their jti values (we never index tokens per user). Used by
   * the password reset: whoever hijacked the account keeps a live session
   * otherwise, which would defeat the point of resetting.
   *
   * The key expires with the longest-lived token it could possibly gate, so it
   * cleans itself up instead of accumulating one entry per user forever.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.redis.set(
      this.cutoffKey(userId),
      String(now),
      'EX',
      this.refreshTtlSeconds(),
    );
  }

  /** True when the token predates a revokeAllForUser call - i.e. it is dead. */
  async isRevokedByCutoff(payload: IRefreshTokenPayload): Promise<boolean> {
    const raw = await this.redis.get(this.cutoffKey(payload.sub));
    if (raw === null) return false;
    // `iat <= cutoff`, not `<`. Both are stamped with 1-second resolution, so a
    // plain `<` would spare any token minted during the same second as the
    // reset - including the attacker's. Erring the other way costs a legitimate
    // user who logged in within that same second one extra sign-in.
    return payload.iat <= Number(raw);
  }

  private key(jti: string): string {
    return `${RefreshTokenService.BLACKLIST_PREFIX}${jti}`;
  }

  private cutoffKey(userId: string): string {
    return `${RefreshTokenService.CUTOFF_PREFIX}${userId}`;
  }

  /**
   * config.auth.refreshTtl is a jsonwebtoken duration string ('7d'), not a
   * number. Rather than re-implement that parser, sign a throwaway token and
   * read the exp it produced - guaranteed to match the real tokens' lifetime.
   */
  private refreshTtlSeconds(): number {
    if (this.cachedTtlSeconds !== null) return this.cachedTtlSeconds;
    const probe = jwt.sign({}, config.auth.refreshSecret, {
      expiresIn: config.auth.refreshTtl as SignOptions['expiresIn'],
    });
    const { exp, iat } = jwt.decode(probe) as { exp: number; iat: number };
    this.cachedTtlSeconds = exp - iat;
    return this.cachedTtlSeconds;
  }
}
