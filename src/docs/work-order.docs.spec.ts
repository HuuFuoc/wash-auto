import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  adminWorkOrderRouter,
  washerWorkOrderRouter,
} from '../modules/work-order/work-order.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('work-order docs', () => {
  it('documents every /admin/work-orders route', () => {
    assertRouterDocumented(
      adminWorkOrderRouter,
      '/admin/work-orders',
      spec.paths,
    );
  });
  it('documents every /me/work-orders route', () => {
    assertRouterDocumented(
      washerWorkOrderRouter,
      '/me/work-orders',
      spec.paths,
    );
  });
});
