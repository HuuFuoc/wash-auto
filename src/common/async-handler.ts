import { RequestHandler } from 'express';

/**
 * Express 5 already forwards rejected promises from async handlers to the
 * error middleware automatically, so wrapping is OPTIONAL. Kept for explicit
 * intent and parity with handlers written defensively.
 *
 * Generic over the RequestHandler type params so a handler that narrows its
 * route params (e.g. `Request<IdParam>`) keeps that type through the wrap and
 * still lines up with Express 5's route-literal param inference on `router.get`.
 */
export const asyncHandler =
  <
    P = any,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any,
    Locals extends Record<string, any> = Record<string, any>,
  >(
    fn: RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>,
  ): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
