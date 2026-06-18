import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { BadRequestException } from '../../common/exceptions';
import { HttpException } from '../../common/http-exception';
import { config } from '../../config';
import { redisClient } from '../../core/redis';
import {
  IOtpSendResult,
  IStoredOtp,
} from '../../shared/otp/types/otp.types';
import { EmailService, getEmailService } from '../email/email.service';

/** HTTP 429 — Nest used `new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS)`. */
const TOO_MANY_REQUESTS = 429;

// Business logic copied verbatim from features/otp/otp.service.ts; only DI
// (REDIS_CLIENT / ConfigService / EmailService) + Nest exceptions + Logger
// were swapped out.
export class OtpService {
  constructor(
    private readonly redis: Redis = redisClient,
    private readonly emailService: EmailService = getEmailService(),
  ) {}

  /**
   * Generates an OTP, stores its hash, enforces per-email rate limits,
   * and dispatches the code via SMTP. Returns sentinel info only -
   * never the code itself.
   */
  async issueAndSend(email: string, ip: string): Promise<IOtpSendResult> {
    const normalized = email.toLowerCase().trim();
    await this.assertSendRateLimit(normalized);

    const code = this.generateCode();
    const hash = this.sha256(code);
    const ttl = config.otp.ttlSeconds;

    const payload: IStoredOtp = { hash, attempts: 0, createdAt: Date.now() };
    await this.redis.set(
      this.codeKey(normalized),
      JSON.stringify(payload),
      'EX',
      ttl,
    );

    await this.emailService.sendOtpEmail(normalized, code, ttl);

    console.log(`OTP issued email=${normalized} ip=${ip}`);
    return { skipped: false };
  }

  /**
   * Verifies the code in constant time. On 5+ wrong attempts the record
   * is deleted to force the user to request a new OTP. Returns void on
   * success; throws BadRequestException with a generic message on any
   * failure (no info leakage).
   */
  async verify(email: string, code: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const key = this.codeKey(normalized);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    let stored: IStoredOtp;
    try {
      stored = JSON.parse(raw) as IStoredOtp;
    } catch {
      await this.redis.del(key);
      throw new BadRequestException('Invalid or expired OTP');
    }

    const maxAttempts = config.otp.maxVerifyAttempts;
    if (stored.attempts >= maxAttempts) {
      await this.redis.del(key);
      throw new BadRequestException('Invalid or expired OTP');
    }

    const inputHash = this.sha256(code.trim());
    const ok = this.safeEqual(inputHash, stored.hash);

    if (!ok) {
      stored.attempts += 1;
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        await this.redis.set(key, JSON.stringify(stored), 'EX', ttl);
      }
      if (stored.attempts >= maxAttempts) {
        await this.redis.del(key);
      }
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Success - burn the OTP so it cannot be replayed.
    await this.redis.del(key);
  }

  // ---------- helpers ----------

  private async assertSendRateLimit(email: string): Promise<void> {
    const cooldownKey = `otp:rl:cooldown:${email}`;
    const hourlyKey = `otp:rl:hourly:${email}`;
    const cooldownSec = config.otp.perEmailCooldownSeconds;
    const hourlyLimit = config.otp.perEmailHourlyLimit;

    const cooldownExists = await this.redis.exists(cooldownKey);
    if (cooldownExists === 1) {
      throw new HttpException(
        TOO_MANY_REQUESTS,
        'Please wait before requesting another OTP',
      );
    }

    const count = await this.redis.incr(hourlyKey);
    if (count === 1) {
      await this.redis.expire(hourlyKey, 3600);
    }
    if (count > hourlyLimit) {
      throw new HttpException(
        TOO_MANY_REQUESTS,
        'OTP request limit reached. Try again later.',
      );
    }

    await this.redis.set(cooldownKey, '1', 'EX', cooldownSec);
  }

  private codeKey(email: string): string {
    return `otp:${email}`;
  }

  private generateCode(): string {
    const n = randomInt(0, 1_000_000);
    return n.toString().padStart(6, '0');
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }
}

// Shared singleton — auth module reuses this once migrated.
let instance: OtpService | null = null;
export function getOtpService(): OtpService {
  if (!instance) instance = new OtpService();
  return instance;
}
