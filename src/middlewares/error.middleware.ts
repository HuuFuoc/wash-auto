import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../common/http-exception';

/**
 * Centralised error handler — MUST be registered last in app.ts, after all
 * routers. Reproduces Nest's default error body: `{ statusCode, message, error }`
 * where `message` is a string or a string[] (ValidationPipe). Unknown errors
 * collapse to a 500.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpException) {
    const body: Record<string, unknown> = {
      statusCode: err.status,
      message: err.response,
    };
    if (err.error) body.error = err.error;
    res.status(err.status).json(body);
    return;
  }

  res.status(500).json({
    statusCode: 500,
    message: err.message || 'Internal Server Error',
  });
}
