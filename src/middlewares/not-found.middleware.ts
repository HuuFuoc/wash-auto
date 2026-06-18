import { Request, Response } from 'express';

/**
 * Catch-all for unmatched routes — parity with NestJS (Express adapter), which
 * throws NotFoundException for an unmatched route, producing the JSON body:
 *   { message: "Cannot <METHOD> <url>", error: "Not Found", statusCode: 404 }
 * (verified live against the Nest app). Key order mirrors Nest's
 * createHttpExceptionBody (message, error, statusCode).
 *
 * MUST be registered AFTER all routers and BEFORE the error middleware. Only
 * fires for routes that matched nothing — NotFoundException thrown from a
 * service still flows through the normal error middleware unchanged.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Cannot ${req.method} ${req.originalUrl}`,
    error: 'Not Found',
    statusCode: 404,
  });
}
