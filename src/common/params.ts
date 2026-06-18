/**
 * Common route-param shapes for typing Express handlers. Needed because in
 * Express 5 the default `req.params` index signature is `string | string[]`
 * (path-to-regexp v8 wildcard params can be arrays). Declaring the param shape
 * via `Request<IdParam>` narrows `req.params.id` back to `string`.
 */
export interface IdParam {
  id: string;
}
