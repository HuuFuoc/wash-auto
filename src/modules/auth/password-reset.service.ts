import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { BadRequestException } from '../../common/exceptions';
import { config } from '../../config';
import { redisClient } from '../../core/redis';
import { EmailService, getEmailService } from '../email/email.service';

/** Same shape as IStoredOtp, kept local so the two flows can diverge freely. */
interface IStoredResetCode {
  hash: string;
  attempts: number;
  createdAt: number;
}

/**
 * Issues and verifies the 6-digit code that backs POST /auth/forgot-password →
 * POST /auth/reset-password. Structurally a sibling of OtpService, but with its
 * OWN Redis namespace (`pwreset:` vs `otp:`) on purpose:
 *  - an email-verification code must never be spendable as a password reset;
 *  - requesting a reset must not clobber a pending verification code.
 *
 * Rate limiting lives in the router (passwordResetRateLimiter) rather than here:
 * throwing 429 only for real accounts would turn this endpoint into an account
 * enumeration oracle, so the limit has to be applied before we know whether the
 * address belongs to anyone.
 */
export class PasswordResetService {
  private static readonly CODE_PREFIX = 'pwreset:code:';

  constructor(
    private readonly redis: Redis = redisClient,
    private readonly emailService: EmailService = getEmailService(),
  ) {}

  /**
   * Generates a code, stores only its hash, and mails it. Any previously issued
   * code for the same address is overwritten - the newest mail always wins.
   */
  async issueAndSend(email: string, ip: string): Promise<void> {
    const normalized = this.normalize(email);
    const code = this.generateCode();
    const ttl = config.passwordReset.ttlSeconds;

    const payload: IStoredResetCode = {
      hash: this.sha256(code),
      attempts: 0,
      createdAt: Date.now(),
    };
    await this.redis.set(
      this.codeKey(normalized),
      JSON.stringify(payload),
      'EX',
      ttl,
    );

    await this.emailService.sendPasswordResetEmail(normalized, code, ttl);
    console.log(`Password reset code issued email=${normalized} ip=${ip}`);
  }

  /**
   * Consumes the code. Every failure mode throws the SAME message so a caller
   * cannot tell "no code was ever requested" from "wrong digits". On success the
   * record is deleted, making the code single-use.
   */
  async verify(email: string, code: string): Promise<void> {
    const key = this.codeKey(this.normalize(email));
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    let stored: IStoredResetCode;
    try {
      stored = JSON.parse(raw) as IStoredResetCode;
    } catch {
      await this.redis.del(key);
      throw new BadRequestException('Invalid or expired reset code');
    }

    const maxAttempts = config.passwordReset.maxVerifyAttempts;
    if (stored.attempts >= maxAttempts) {
      await this.redis.del(key);
      throw new BadRequestException('Invalid or expired reset code');
    }

    if (!this.safeEqual(this.sha256(code.trim()), stored.hash)) {
      stored.attempts += 1;
      // Preserve the ORIGINAL expiry - a wrong guess must not extend the window.
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        await this.redis.set(key, JSON.stringify(stored), 'EX', ttl);
      }
      if (stored.attempts >= maxAttempts) {
        await this.redis.del(key);
      }
      throw new BadRequestException('Invalid or expired reset code');
    }

    await this.redis.del(key);
  }

  /** Drops a pending code, e.g. once the reset has actually been applied. */
  async invalidate(email: string): Promise<void> {
    await this.redis.del(this.codeKey(this.normalize(email)));
  }

  // ---------- helpers ----------

  private normalize(email: string): string {
    return email.toLowerCase().trim();
  }

  private codeKey(email: string): string {
    return `${PasswordResetService.CODE_PREFIX}${email}`;
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }
}
