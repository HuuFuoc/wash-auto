import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { HttpException } from '../common/http-exception';
import { RoleEnum } from '../shared/auth/types/role.enum';

/**
 * Equivalent of `RolesGuard` — a ROLE guard, NOT an auth guard. It assumes
 * `authMiddleware` already ran and populated `req.user`; chain it AFTER auth:
 *   router.delete('/:id', authMiddleware, roleMiddleware(RoleEnum.ADMIN), handler)
 *
 * Reproduces RolesGuard's exact behaviour: empty role list = allow; no user =
 * 403 'Authentication required'; wrong role = 403 'Requires one of roles: ...'.
 * Matches Nest's ForbiddenException body ({ statusCode: 403, message, error: 'Forbidden' }).
 */
export const roleMiddleware =
  (...roles: RoleEnum[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (roles.length === 0) return next();

    if (!req.user) {
      return next(
        new HttpException(403, 'Authentication required', 'Forbidden'),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new HttpException(
          403,
          `Requires one of roles: ${roles.join(', ')}`,
          'Forbidden',
        ),
      );
    }

    next();
  };
