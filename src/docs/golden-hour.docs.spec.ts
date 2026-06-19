import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { adminGoldenHourRouter } from '../modules/golden-hour/golden-hour.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('golden-hour docs', () => {
  it('documents every /admin/golden-hours route', () => {
    assertRouterDocumented(
      adminGoldenHourRouter,
      '/admin/golden-hours',
      spec.paths,
    );
  });
});
