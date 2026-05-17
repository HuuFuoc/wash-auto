import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { JwtScope } from '../../../shared/types/jwt-scope.enum';
import { IVerifiedEmailPayload } from '../../../shared/types/verified-email-payload.type';

@Injectable()
export class VerifiedEmailTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Signs a short-lived JWT used as the bearer for POST /me/bookings. */
  async sign(userId: string, email: string): Promise<string> {
    const payload: IVerifiedEmailPayload = {
      sub: userId,
      email,
      scope: JwtScope.EMAIL_VERIFIED,
    };
    return this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('otp.verifiedEmailSecret'),
      expiresIn: this.config.getOrThrow<string>(
        'otp.verifiedEmailTtl',
      ) as SignOptions['expiresIn'],
    });
  }
}
