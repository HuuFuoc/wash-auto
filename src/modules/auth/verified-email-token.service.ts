import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../../config';
import { JwtScope } from '../../shared/types/jwt-scope.enum';
import { IVerifiedEmailPayload } from '../../shared/types/verified-email-payload.type';

// Was features/auth/services/verified-email-token.service.ts. Signs the
// short-lived scope=email_verified JWT (different secret than the access token).
export class VerifiedEmailTokenService {
  async sign(userId: string, email: string): Promise<string> {
    const payload: IVerifiedEmailPayload = {
      sub: userId,
      email,
      scope: JwtScope.EMAIL_VERIFIED,
    };
    return jwt.sign(payload, config.otp.verifiedEmailSecret, {
      expiresIn: config.otp.verifiedEmailTtl as SignOptions['expiresIn'],
    });
  }
}
