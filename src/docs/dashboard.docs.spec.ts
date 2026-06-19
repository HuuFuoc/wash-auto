import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { adminDashboardRouter } from '../modules/dashboard/dashboard.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('dashboard docs', () => {
  it('documents every /admin/dashboard route', () => {
    assertRouterDocumented(
      adminDashboardRouter,
      '/admin/dashboard',
      spec.paths,
    );
  });
});
