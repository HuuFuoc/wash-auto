import { Types } from 'mongoose';
import { OrderService } from './order.service';

/**
 * Regression tests for `listAvailableSlots` after the washer-skill gate was
 * removed. The reported bug: a washer had a scheduled shift but no skills, so
 * the endpoint short-circuited to `[]` and the booking page showed no slots.
 *
 * The `userRepository` mock below has NO skill method, so if the service ever
 * tried to look up washer skills again it would throw - making these tests a
 * guard against the gate creeping back in.
 */
describe('OrderService.listAvailableSlots (skill-agnostic)', () => {
  const vehicleTypeId = new Types.ObjectId();

  // 08:00–11:00 Vietnam local time (UTC+7) on a clearly-future day, so `now`
  // never clips the window and the slots sit inside the morning office hours.
  const shift = {
    _id: new Types.ObjectId(),
    start_at: new Date('2030-01-15T01:00:00.000Z'),
    end_at: new Date('2030-01-15T04:00:00.000Z'),
  };

  const dto = {
    serviceTypeId: new Types.ObjectId().toString(),
    vehicleTypeId: vehicleTypeId.toString(),
    from: new Date('2030-01-15T00:00:00.000Z'),
    to: new Date('2030-01-15T05:00:00.000Z'),
  };

  let orderRepository: { findActiveByShifts: jest.Mock };
  let serviceTypeRepository: { findById: jest.Mock };
  let staffShiftRepository: { findOverlapping: jest.Mock };
  let tierConfigRepository: { findById: jest.Mock };
  let loyaltyService: { ensureForCustomer: jest.Mock };
  let goldenHourService: { findActiveAt: jest.Mock };
  let config: { getOrThrow: jest.Mock };
  let userRepository: Record<string, never>;
  let service: OrderService;

  beforeEach(() => {
    orderRepository = { findActiveByShifts: jest.fn().mockResolvedValue([]) };
    serviceTypeRepository = {
      findById: jest.fn().mockResolvedValue({
        is_active: true,
        vehicle_pricing: [
          {
            is_active: true,
            vehicle_type_id: vehicleTypeId,
            price: 50000,
            estimated_minutes: 30,
          },
        ],
      }),
    };
    staffShiftRepository = {
      findOverlapping: jest.fn().mockResolvedValue([shift]),
    };
    tierConfigRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ booking_window_days: 3650, discount_percent: 0 }),
    };
    loyaltyService = {
      ensureForCustomer: jest
        .fn()
        .mockResolvedValue({ tier_config_id: new Types.ObjectId() }),
    };
    goldenHourService = { findActiveAt: jest.fn().mockResolvedValue(null) };
    config = { getOrThrow: jest.fn().mockReturnValue(30) };
    userRepository = {};

    // Build OrderService with the dependencies listAvailableSlots touches;
    // everything else is irrelevant for this path.
    service = new OrderService(
      orderRepository as never,
      {} as never, // transactionRepository
      {} as never, // vehicleRepository
      {} as never, // vehicleService
      serviceTypeRepository as never,
      staffShiftRepository as never,
      userRepository as never,
      tierConfigRepository as never,
      loyaltyService as never,
      {} as never, // voucherService
      goldenHourService as never,
      {} as never, // payosService
      {} as never, // emailService
      config as never,
      {} as never, // redis
    );
  });

  it('returns slots from a washer shift even when no washer has any skill', async () => {
    const slots = await service.listAvailableSlots('customer-1', dto);

    // 08:00–11:00 with a 30-min service on a 30-min grid → 08:00 … 10:30.
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.remainingCapacity === 1)).toBe(true);
    expect(slots[0].scheduledAt).toEqual(shift.start_at);
  });

  it('queries overlapping shifts by window only - no skilled-washer filter', async () => {
    await service.listAvailableSlots('customer-1', dto);

    // (from, to) only - the third "skilled washer ids" argument is gone, so
    // an exact-args match on two arguments proves the filter was dropped.
    expect(staffShiftRepository.findOverlapping).toHaveBeenCalledTimes(1);
    expect(staffShiftRepository.findOverlapping).toHaveBeenCalledWith(
      dto.from,
      dto.to,
    );
  });

  it('returns no slots when no washer shift overlaps the window', async () => {
    staffShiftRepository.findOverlapping.mockResolvedValue([]);

    const slots = await service.listAvailableSlots('customer-1', dto);

    expect(slots).toEqual([]);
  });
});
