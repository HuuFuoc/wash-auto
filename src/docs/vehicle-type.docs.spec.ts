import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  vehicleTypeRouter,
  adminVehicleTypeRouter,
} from '../modules/vehicle-type/vehicle-type.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('vehicle-type docs', () => {
  it('documents every public /vehicle-types route', () => {
    assertRouterDocumented(vehicleTypeRouter, '/vehicle-types', spec.paths);
  });
  it('documents every /admin/vehicle-types route', () => {
    assertRouterDocumented(
      adminVehicleTypeRouter,
      '/admin/vehicle-types',
      spec.paths,
    );
  });
});
