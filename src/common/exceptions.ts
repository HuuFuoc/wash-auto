import { HttpException } from './http-exception';

/**
 * Drop-in replacements for the Nest `@nestjs/common` HTTP exceptions used across
 * the services. Each reproduces Nest's exact response body:
 *  - `new XException()`            → { statusCode, message: <phrase> }
 *  - `new XException('msg')`       → { statusCode, message: 'msg', error: <phrase> }
 *  - `new XException(['a','b'])`   → { statusCode, message: ['a','b'], error: <phrase> }
 *
 * The error middleware renders `HttpException.response` / `.error` into that shape.
 */
abstract class BaseHttpException extends HttpException {
  protected constructor(
    status: number,
    phrase: string,
    message?: string | string[],
  ) {
    super(
      status,
      message ?? phrase,
      message === undefined ? undefined : phrase,
    );
  }
}

export class BadRequestException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(400, 'Bad Request', message);
  }
}

export class UnauthorizedException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(401, 'Unauthorized', message);
  }
}

export class ForbiddenException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(403, 'Forbidden', message);
  }
}

export class NotFoundException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(404, 'Not Found', message);
  }
}

export class ConflictException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(409, 'Conflict', message);
  }
}

export class PayloadTooLargeException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(413, 'Payload Too Large', message);
  }
}

export class UnprocessableEntityException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(422, 'Unprocessable Entity', message);
  }
}

export class InternalServerErrorException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(500, 'Internal Server Error', message);
  }
}

export class ServiceUnavailableException extends BaseHttpException {
  constructor(message?: string | string[]) {
    super(503, 'Service Unavailable', message);
  }
}

export { HttpException };
