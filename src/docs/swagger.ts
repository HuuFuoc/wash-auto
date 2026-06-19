import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { parse } from 'yaml';
import type { Express, Request, Response } from 'express';
import { config } from '../config';

let cached: Record<string, unknown> | null | undefined;

/** Reads + parses src/docs/openapi.yaml (copied to dist/docs at build). Returns
 *  null (and warns) if missing/invalid — docs must never crash the server. */
export function loadOpenApiSpec(): Record<string, unknown> | null {
  if (cached !== undefined) return cached;
  try {
    const file = readFileSync(join(__dirname, 'openapi.yaml'), 'utf8');
    cached = parse(file) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      `[Swagger] openapi.yaml not loaded — docs disabled: ${(err as Error).message}`,
    );
    cached = null;
  }
  return cached;
}

// Swagger UI assets load from a CDN. swagger-ui-dist's static files are NOT
// bundled into the Vercel serverless function, so swagger-ui-express's default
// page renders blank. This self-contained page loads the CDN bundle FIRST, then
// initialises against the spec served at /<prefix>/docs.json.
const CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6';

function docsHtml(specUrl: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WAVE / AutoWash Pro API</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/swagger-ui-bundle.js"></script>
  <script src="${CDN}/swagger-ui-standalone-preset.js"></script>
  <script nonce="${nonce}">
    window.ui = SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  </script>
</body>
</html>`;
}

/** Mounts /<prefix>/docs (UI) and /<prefix>/docs.json (raw spec). No-op if spec missing. */
export function mountSwagger(app: Express): void {
  const doc = loadOpenApiSpec();
  if (!doc) return;
  const prefix = config.app.globalPrefix;
  const specUrl = `/${prefix}/docs.json`;

  app.get(specUrl, (_req: Request, res: Response) => {
    res.json(doc);
  });

  app.get(
    [`/${prefix}/docs`, `/${prefix}/docs/`],
    (_req: Request, res: Response) => {
      // Override Helmet's strict default CSP for THIS page only so the CDN
      // assets + the nonce'd inline init script are allowed. swagger-ui injects
      // its own <style> at runtime, hence style-src 'unsafe-inline'.
      const nonce = randomBytes(16).toString('base64');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          `script-src 'self' ${CDN.split('/npm/')[0]} 'nonce-${nonce}'`,
          `style-src 'self' ${CDN.split('/npm/')[0]} 'unsafe-inline'`,
          `img-src 'self' data: ${CDN.split('/npm/')[0]}`,
          "worker-src 'self' blob:",
          "connect-src 'self'",
        ].join('; '),
      );
      res.type('html').send(docsHtml(specUrl, nonce));
    },
  );
}
