import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from '../../../core/cache/cache.module';

export interface IRefreshTokenPayload {
  sub: string;
  jti: string;
  exp: number;
}

export interface ISignedRefreshToken {
  token: string;
  jti: string;
}

@Injectable()
export class RefreshTokenService {
  private static readonly BLACKLIST_PREFIX = 'refresh:bl:';

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async sign(userId: string): Promise<ISignedRefreshToken> {
    const jti = randomUUID();
    const token = await this.jwtService.signAsync(
      { sub: userId, jti },
      {
        secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'auth.refreshTtl',
        ) as SignOptions['expiresIn'],
      },
    );
    return { token, jti };
  }

  async verify(token: string): Promise<IRefreshTokenPayload> {
    return this.jwtService.verifyAsync<IRefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
    });
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
