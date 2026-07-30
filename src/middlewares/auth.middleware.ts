import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpException } from '../common/http-exception';
import { IAuthPayload } from '../shared/types/auth-payload.type';

/**
 * Request with the authenticated access-token payload attached. Mirrors how the
 * passport-jwt strategy populated `req.user` with IAuthPayload ({ sub, email, role }).
 * Generic over the route-param shape so handlers can narrow `req.params`
 * (e.g. `AuthRequest<IdParam>`) — Express 5's default params are `string | string[]`.
 *
 * Both middlewares below carry the same type parameter, defaulted, so they can
 * sit inline on a route whose handler narrows the params (`router.post('/:id',
 * authMiddleware, handler)`) without Express pinning the whole chain back to
 * `ParamsDictionary`. Neither one reads `req.params`, so the shape is purely a
 * typing concern.
 */
export interface AuthRequest<P = ParamsDictionary> extends Request<P> {
  user?: IAuthPayload;
}

// Takes just the headers rather than a whole `Request`, so it works for any
// param shape the two generic middlewares below are instantiated with.
export function extractBearer(
  req: Pick<Request, 'headers'>,
): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : undefined;
}

/**
 * Equivalent of `JwtAuthGuard` (AuthGuard('jwt')): verifies the ACCESS token
 * with `auth.accessSecret`, rejecting missing / invalid / expired tokens with
 * 401. Matches Nest's default `new UnauthorizedException()` body
 * ({ statusCode: 401, message: 'Unauthorized' }).
 */
export function authMiddleware<P = ParamsDictionary>(
  req: AuthRequest<P>,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractBearer(req);
  if (!token) {
    return next(new HttpException(401, 'Unauthorized'));
  }
  try {
    req.user = jwt.verify(token, config.auth.accessSecret) as IAuthPayload;
    next();
  } catch {
    next(new HttpException(401, 'Unauthorized'));
  }
}

/**
 * Equivalent of `OptionalJwtAuthGuard`: if a valid bearer token is present,
 * populate `req.user`; otherwise run the route anonymously. NEVER throws.
 */
export function optionalAuthMiddleware<P = ParamsDictionary>(
  req: AuthRequest<P>,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, config.auth.accessSecret) as IAuthPayload;
  } catch {
    // Invalid/expired token → treat as anonymous, do not block the request.
  }
  next();
}
