import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  meVoucherRouter,
  adminVoucherRouter,
} from '../modules/voucher/voucher.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('voucher docs', () => {
  it('documents every /me/vouchers route', () => {
    assertRouterDocumented(meVoucherRouter, '/me/vouchers', spec.paths);
  });
  it('documents every /admin/vouchers route', () => {
    assertRouterDocumented(adminVoucherRouter, '/admin/vouchers', spec.paths);
  });
});
