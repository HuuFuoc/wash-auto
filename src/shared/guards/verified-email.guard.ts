import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtScope } from '../types/jwt-scope.enum';
import { IVerifiedEmailPayload } from '../types/verified-email-payload.type';

/**
 * Accepts a JWT signed with JWT_VERIFIED_EMAIL_SECRET and carrying
 * scope === 'email_verified'. Rejects access tokens, refresh tokens,
 * unsigned tokens, or expired tokens. On success req.user becomes
 * IVerifiedEmailPayload.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  private readonly logger = new Logger(VerifiedEmailGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Verified-email token required');
    }

    const secret = this.config.getOrThrow<string>('otp.verifiedEmailSecret');
    let payload: IVerifiedEmailPayload;
    try {
      payload = await this.jwtService.verifyAsync<IVerifiedEmailPayload>(
        token,
        { secret },
      );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired verified-email token',
      );
    }

    if (payload.scope !== JwtScope.EMAIL_VERIFIED) {
      this.logger.warn(
        `Rejected token with wrong scope: ${String(payload.scope)}`,
      );
      throw new UnauthorizedException('Invalid token scope');
    }

    req.user = payload;
    return true;
  }

  private extractBearer(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (!auth) return undefined;
    const [scheme, value] = auth.split(' ');
    return scheme === 'Bearer' && value ? value : undefined;
  }
}
