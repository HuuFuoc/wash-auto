import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  serviceTypeRouter,
  adminServiceTypeRouter,
} from '../modules/service-type/service-type.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('service-type docs', () => {
  it('documents every public /service-types route', () => {
    assertRouterDocumented(serviceTypeRouter, '/service-types', spec.paths);
  });
  it('documents every /admin/service-types route', () => {
    assertRouterDocumented(
      adminServiceTypeRouter,
      '/admin/service-types',
      spec.paths,
    );
  });
});
