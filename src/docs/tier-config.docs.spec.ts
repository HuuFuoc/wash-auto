import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  tierConfigRouter,
  adminTierConfigRouter,
} from '../modules/tier-config/tier-config.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('tier-config docs', () => {
  it('documents every public /tier-configs route', () => {
    assertRouterDocumented(tierConfigRouter, '/tier-configs', spec.paths);
  });
  it('documents every /admin/tier-configs route', () => {
    assertRouterDocumented(
      adminTierConfigRouter,
      '/admin/tier-configs',
      spec.paths,
    );
  });
});
