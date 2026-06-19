import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { adminUserRouter } from '../modules/user/user.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('user docs', () => {
  it('documents every /admin/users route', () => {
    assertRouterDocumented(adminUserRouter, '/admin/users', spec.paths);
  });
});
