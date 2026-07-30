/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
import { Types } from 'mongoose';
import { VehicleService, resolveVehicleSort } from './vehicle.service';
import {
  SortOrderEnum,
  VehicleSortByEnum,
} from '../../shared/vehicle/dto/query-vehicle.dto';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';

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

describe('VehicleService.softDeleteOwn — a car that owes a wash cannot be removed', () => {
  const customerId = new Types.ObjectId().toString();
  const vehicleId = new Types.ObjectId();

  function makeHarness(isActive = true) {
    const vehicleRepository = {
      findByIdForOwner: jest.fn(async () => ({
        _id: vehicleId,
        is_active: isActive,
      })),
      updateById: jest.fn(async () => ({
        _id: vehicleId,
        is_active: false,
        is_default: false,
        customer_id: new Types.ObjectId(customerId),
        vehicle_type_id: new Types.ObjectId(),
        license_plate: '30A-123.45',
      })),
    };
    const orderRepository = {
      findActiveByVehicle: jest.fn(
        async (): Promise<
          { scheduled_at: Date; status: OrderStatusEnum }[]
        > => [],
      ),
    };
    const service = new VehicleService(
      vehicleRepository as never,
      {} as never,
      orderRepository as never,
    );
    return { service, vehicleRepository, orderRepository };
  }

  it('removes a car with no outstanding booking', async () => {
    const h = makeHarness();

    await h.service.softDeleteOwn(customerId, vehicleId.toString());

    expect(h.vehicleRepository.updateById).toHaveBeenCalledWith(
      vehicleId.toString(),
      { isActive: false, isDefault: false },
    );
  });

  it('refuses while a booking is still waiting to be washed', async () => {
    const h = makeHarness();
    h.orderRepository.findActiveByVehicle.mockResolvedValueOnce([
      {
        scheduled_at: new Date('2026-08-02T07:30:00.000Z'), // 14:30 giờ VN
        status: OrderStatusEnum.CONFIRMED,
      },
    ]);

    await expect(
      h.service.softDeleteOwn(customerId, vehicleId.toString()),
    ).rejects.toMatchObject({ status: 409 });
    // The car must still be there afterwards.
    expect(h.vehicleRepository.updateById).not.toHaveBeenCalled();
  });

  it('names the soonest outstanding wash in Vietnam local time', async () => {
    const h = makeHarness();
    h.orderRepository.findActiveByVehicle.mockResolvedValueOnce([
      {
        scheduled_at: new Date('2026-08-05T03:00:00.000Z'),
        status: OrderStatusEnum.CONFIRMED,
      },
      {
        scheduled_at: new Date('2026-08-02T07:30:00.000Z'),
        status: OrderStatusEnum.PENDING_PAYMENT,
      },
    ]);

    await expect(
      h.service.softDeleteOwn(customerId, vehicleId.toString()),
    ).rejects.toThrow(/2026-08-02 14:30.*và 1 lịch khác/);
  });

  it('blocks a wash already in progress, not just future bookings', async () => {
    const h = makeHarness();
    h.orderRepository.findActiveByVehicle.mockResolvedValueOnce([
      {
        scheduled_at: new Date(Date.now() - 10 * 60_000),
        status: OrderStatusEnum.IN_PROGRESS,
      },
    ]);

    await expect(
      h.service.softDeleteOwn(customerId, vehicleId.toString()),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('stays idempotent for an already-removed car without querying orders', async () => {
    const h = makeHarness(false);

    await expect(
      h.service.softDeleteOwn(customerId, vehicleId.toString()),
    ).resolves.toBeUndefined();
    expect(h.orderRepository.findActiveByVehicle).not.toHaveBeenCalled();
  });
});
