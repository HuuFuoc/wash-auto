import { resolveVehicleSort } from './vehicle.service';
import {
  SortOrderEnum,
  VehicleSortByEnum,
} from '../../shared/vehicle/dto/query-vehicle.dto';

describe('resolveVehicleSort', () => {
  it('defaults to created_at descending', () => {
    expect(resolveVehicleSort()).toEqual({ field: 'created_at', order: -1 });
  });

  it('maps usageCount + asc to the derived field', () => {
    expect(
      resolveVehicleSort(VehicleSortByEnum.USAGE_COUNT, SortOrderEnum.ASC),
    ).toEqual({ field: 'usage_count', order: 1 });
  });

  it('maps customerName and vehicleType to lookup fields', () => {
    expect(resolveVehicleSort(VehicleSortByEnum.CUSTOMER_NAME).field).toBe(
      'customer_name',
    );
    expect(resolveVehicleSort(VehicleSortByEnum.VEHICLE_TYPE).field).toBe(
      'vehicle_type_name',
    );
  });

  it('maps status to is_active', () => {
    expect(resolveVehicleSort(VehicleSortByEnum.STATUS).field).toBe(
      'is_active',
    );
  });
});
