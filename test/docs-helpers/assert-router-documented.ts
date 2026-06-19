import type { Router } from 'express';

type Methods = Record<string, boolean>;
interface RouteLayer {
  route?: { path: string; methods: Methods };
}

/** Express path (`/:id`) -> OpenAPI path (`/{id}`). */
function toOpenApiPath(prefix: string, sub: string): string {
  const raw = `${prefix}${sub === '/' ? '' : sub}` || '/';
  return raw.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** Asserts every route on `router` exists in `specPaths` (an OpenAPI `paths` object).
 *  `mountPrefix` is the path the router is mounted at under /api, e.g. '/service-types'. */
export function assertRouterDocumented(
  router: Router,
  mountPrefix: string,
  specPaths: Record<string, Record<string, unknown>>,
): void {
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const missing: string[] = [];
  for (const layer of layers) {
    if (!layer.route) continue;
    const oaPath = toOpenApiPath(mountPrefix, layer.route.path);
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all') continue;
      const documented = specPaths[oaPath]?.[method.toLowerCase()];
      if (!documented) missing.push(`${method.toUpperCase()} ${oaPath}`);
    }
  }
  if (missing.length) {
    throw new Error(
      `Undocumented routes for ${mountPrefix}:\n  ${missing.join('\n  ')}`,
    );
  }
}
