import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { authRouter } from '../modules/auth/auth.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('auth docs', () => {
  it('documents every /auth route', () => {
    assertRouterDocumented(authRouter, '/auth', spec.paths);
  });
});
