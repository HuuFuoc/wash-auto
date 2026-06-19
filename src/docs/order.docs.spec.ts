import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  meOrderRouter,
  paymentWebhookRouter,
  adminOrderRouter,
  washerScheduleRouter,
} from '../modules/order/order.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('order docs', () => {
  it('documents every /me/orders route', () => {
    assertRouterDocumented(meOrderRouter, '/me/orders', spec.paths);
  });
  it('documents the /payments webhook route', () => {
    assertRouterDocumented(paymentWebhookRouter, '/payments', spec.paths);
  });
  it('documents every /admin/orders route', () => {
    assertRouterDocumented(adminOrderRouter, '/admin/orders', spec.paths);
  });
  it('documents the /washers/me schedule route', () => {
    assertRouterDocumented(washerScheduleRouter, '/washers/me', spec.paths);
  });
});
