import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpException } from '../common/http-exception';
import { JwtScope } from '../shared/types/jwt-scope.enum';
import { IVerifiedEmailPayload } from '../shared/types/verified-email-payload.type';
import { extractBearer } from './auth.middleware';

/**
 * Request carrying a verified-email token payload (NOT an access-token user).
 */
export interface VerifiedEmailRequest extends Request {
  user?: IVerifiedEmailPayload;
}

/**
 * Equivalent of `VerifiedEmailGuard`. This is NOT the normal auth guard — it
 * accepts a token signed with `JWT_VERIFIED_EMAIL_SECRET` (a DIFFERENT secret)
 * carrying scope === 'email_verified'. Access tokens, refresh tokens, unsigned
 * or expired tokens are rejected with 401. On success `req.user` becomes the
 * IVerifiedEmailPayload. Mirrors Nest's UnauthorizedException(message) body
 * ({ statusCode: 401, message, error: 'Unauthorized' }).
 */
export function verifiedEmailMiddleware(
  req: VerifiedEmailRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractBearer(req);
  if (!token) {
    return next(
      new HttpException(401, 'Verified-email token required', 'Unauthorized'),
    );
  }

  let payload: IVerifiedEmailPayload;
  try {
    payload = jwt.verify(
      token,
      config.otp.verifiedEmailSecret,
    ) as IVerifiedEmailPayload;
  } catch {
    return next(
      new HttpException(
        401,
        'Invalid or expired verified-email token',
        'Unauthorized',
      ),
    );
  }

  if (payload.scope !== JwtScope.EMAIL_VERIFIED) {
    return next(new HttpException(401, 'Invalid token scope', 'Unauthorized'));
  }

  req.user = payload;
  next();
}
