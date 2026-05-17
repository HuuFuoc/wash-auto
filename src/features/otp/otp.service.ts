import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { EmailService } from '../email/email.service';
import { IOtpSendResult, IStoredOtp } from './types/otp.types';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generates an OTP, stores its hash, enforces per-email rate limits,
   * and dispatches the code via SMTP. Returns sentinel info only —
   * never the code itself.
   */
  async issueAndSend(email: string, ip: string): Promise<IOtpSendResult> {
    const normalized = email.toLowerCase().trim();
    await this.assertSendRateLimit(normalized);

    const code = this.generateCode();
    const hash = this.sha256(code);
    const ttl = this.config.getOrThrow<number>('otp.ttlSeconds');

    const payload: IStoredOtp = { hash, attempts: 0, createdAt: Date.now() };
    await this.redis.set(
      this.codeKey(normalized),
      JSON.stringify(payload),
      'EX',
      ttl,
    );

    await this.emailService.sendOtpEmail(normalized, code, ttl);

    this.logger.log(`OTP issued email=${normalized} ip=${ip}`);
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

    const maxAttempts = this.config.getOrThrow<number>('otp.maxVerifyAttempts');
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

    // Success — burn the OTP so it cannot be replayed.
    await this.redis.del(key);
  }

  // ---------- helpers ----------

  private async assertSendRateLimit(email: string): Promise<void> {
    const cooldownKey = `otp:rl:cooldown:${email}`;
    const hourlyKey = `otp:rl:hourly:${email}`;
    const cooldownSec = this.config.getOrThrow<number>(
      'otp.perEmailCooldownSeconds',
    );
    const hourlyLimit = this.config.getOrThrow<number>(
      'otp.perEmailHourlyLimit',
    );

    const cooldownExists = await this.redis.exists(cooldownKey);
    if (cooldownExists === 1) {
      throw new HttpException(
        'Please wait before requesting another OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const count = await this.redis.incr(hourlyKey);
    if (count === 1) {
      await this.redis.expire(hourlyKey, 3600);
    }
    if (count > hourlyLimit) {
      throw new HttpException(
        'OTP request limit reached. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
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
