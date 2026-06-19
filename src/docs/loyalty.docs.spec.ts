import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { meLoyaltyRouter } from '../modules/loyalty/loyalty.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('loyalty docs', () => {
  it('documents every /me/loyalty route', () => {
    assertRouterDocumented(meLoyaltyRouter, '/me/loyalty', spec.paths);
  });
});
