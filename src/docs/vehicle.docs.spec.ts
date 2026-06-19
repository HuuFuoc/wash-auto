import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  meVehicleRouter,
  adminVehicleRouter,
} from '../modules/vehicle/vehicle.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('vehicle docs', () => {
  it('documents every /me/vehicles route', () => {
    assertRouterDocumented(meVehicleRouter, '/me/vehicles', spec.paths);
  });
  it('documents every /admin/vehicles route', () => {
    assertRouterDocumented(adminVehicleRouter, '/admin/vehicles', spec.paths);
  });
});
