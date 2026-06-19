import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  shiftRouter,
  adminShiftRouter,
} from '../modules/staff-shift/staff-shift.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('staff-shift docs', () => {
  it('documents every /shifts route', () => {
    assertRouterDocumented(shiftRouter, '/shifts', spec.paths);
  });
  it('documents every /admin/shifts route', () => {
    assertRouterDocumented(adminShiftRouter, '/admin/shifts', spec.paths);
  });
});
