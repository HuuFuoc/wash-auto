import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { uploadRouter } from '../modules/upload/upload.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('upload docs', () => {
  it('documents every /upload route', () => {
    assertRouterDocumented(uploadRouter, '/upload', spec.paths);
  });
});
