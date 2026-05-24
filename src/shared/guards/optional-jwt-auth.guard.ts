import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IAuthPayload } from '../types/auth-payload.type';

/**
 * Like JwtAuthGuard but never throws on a missing/invalid token.
 * If a valid bearer is present, request.user is populated; otherwise
 * the route runs as an anonymous request.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  override handleRequest<TUser = IAuthPayload>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user || undefined;
  }
}
