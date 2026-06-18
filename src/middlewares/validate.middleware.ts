import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { HttpException } from '../common/http-exception';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Transformed + validated DTO instances for non-body sources. Express 5
       * makes `req.query` / `req.params` read-only getters, so we cannot put the
       * transformed instance back on them — controllers read it from here.
       */
      validated?: Partial<Record<'query' | 'params', unknown>>;
    }
  }
}

type DtoSource = 'body' | 'query' | 'params';

/** Flatten nested class-validator errors into a flat message list (Nest-style). */
function collectMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  const walk = (errs: ValidationError[]): void => {
    for (const err of errs) {
      if (err.constraints) messages.push(...Object.values(err.constraints));
      if (err.children?.length) walk(err.children);
    }
  };
  walk(errors);
  return messages;
}

/**
 * Equivalent of Nest's global `ValidationPipe({ transform, whitelist,
 * forbidNonWhitelisted })`. Reuses the original class-validator DTOs unchanged.
 *
 * On failure → 400 `{ statusCode: 400, message: string[], error: 'Bad Request' }`
 * (message kept as an ARRAY, exactly like ValidationPipe — do not join it).
 *
 * On success:
 *  - `body`  → the transformed instance replaces `req.body`.
 *  - `query`/`params` → exposed on `req.validated[source]` (Express 5 makes
 *    those request props read-only, so they cannot be reassigned in place).
 *
 * Usage: `router.post('/', validateDto(CreateUserDto), asyncHandler(controller.create))`
 *        `router.get('/', validateDto(QueryUserDto, 'query'), asyncHandler(controller.list))`
 */
export function validateDto(
  dtoClass: ClassConstructor<object>,
  source: DtoSource = 'body',
  // Returns a width-`any` handler so it does not pin the route's param type:
  // it can sit in front of a narrowed `Request<IdParam>` handler on the same
  // route without forcing Express's param inference to ParamsDictionary.
): RequestHandler<any, any, any, any> {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const dto = plainToInstance(dtoClass, req[source]);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      return next(
        new HttpException(400, collectMessages(errors), 'Bad Request'),
      );
    }

    if (source === 'body') {
      req.body = dto;
    } else {
      req.validated = { ...req.validated, [source]: dto };
    }
    next();
  };
}
