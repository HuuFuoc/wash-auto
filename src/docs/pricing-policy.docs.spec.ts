import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { adminPricingPolicyRouter } from '../modules/pricing-policy/pricing-policy.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('pricing-policy docs', () => {
  it('documents every /admin/pricing-policy route', () => {
    assertRouterDocumented(
      adminPricingPolicyRouter,
      '/admin/pricing-policy',
      spec.paths,
    );
  });
});
