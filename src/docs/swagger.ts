import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
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

/** Mounts /${prefix}/docs (UI) and /${prefix}/docs.json (raw spec). No-op if spec missing. */
export function mountSwagger(app: Express): void {
  const doc = loadOpenApiSpec();
  if (!doc) return;
  const prefix = config.app.globalPrefix;
  app.get(`/${prefix}/docs.json`, (_req, res) => {
    res.json(doc);
  });
  // Serve the UI static assets (swagger-ui-bundle.js, CSS, …) from a CDN.
  // swagger-ui-dist's files are NOT bundled into the Vercel serverless function,
  // so the local assets return HTML (blank page). CDN URLs work everywhere.
  const cdn = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6';
  const uiOptions: swaggerUi.SwaggerUiOptions = {
    customCssUrl: `${cdn}/swagger-ui.css`,
    customJs: [
      `${cdn}/swagger-ui-bundle.js`,
      `${cdn}/swagger-ui-standalone-preset.js`,
    ],
    customSiteTitle: 'WAVE / AutoWash Pro API',
  };
  app.use(`/${prefix}/docs`, swaggerUi.serve, swaggerUi.setup(doc, uiOptions));
}
