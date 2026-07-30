/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
jest.mock('../../core/realtime', () => ({
  ...jest.requireActual<typeof import('../../core/realtime')>(
    '../../core/realtime',
  ),
  emitToOps: jest.fn(),
  emitToUser: jest.fn(),
  emitToCustomers: jest.fn(),
}));

import { Types } from 'mongoose';
import { OrderService } from './order.service';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';

const customerId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const vehicleId = new Types.ObjectId();
const shiftId = new Types.ObjectId();
const otherShiftId = new Types.ObjectId();
const serviceTypeId = new Types.ObjectId();

const DURATION_MIN = 60;
// Shift window: now+1h .. now+9h, so every scheduledAt below is in the future
// and leaves room for a 60-minute wash before the shift ends.
const shiftStart = new Date(Date.now() + 3_600_000);
const shiftEnd = new Date(shiftStart.getTime() + 8 * 3_600_000);
/** Order's current appointment: one hour into the shift. */
const currentAt = new Date(shiftStart.getTime() + 3_600_000);

function shiftDoc(id: Types.ObjectId, capacity: number) {
  return {
    _id: id,
    capacity,
    status: ShiftStatusEnum.SCHEDULED,
    shift_type: ShiftTypeEnum.WASHER,
    start_at: shiftStart,
    end_at: shiftEnd,
  };
}

/**
 * OrderService with only the collaborators rescheduleOwn touches. `shifts`
 * is what the repository will offer for the requested time; `busy` is the set
 * of active orders already sitting in those shifts.
 */
function makeHarness(options: {
  shifts: ReturnType<typeof shiftDoc>[];
  busy: {
    _id: Types.ObjectId;
    staff_shift_id: Types.ObjectId;
    scheduled_at: Date;
    estimated_minutes: number;
  }[];
}) {
  const order = {
    _id: orderId,
    customer_id: customerId,
    vehicle_id: vehicleId,
    service_type_id: serviceTypeId,
    staff_shift_id: shiftId,
    scheduled_at: currentAt,
    estimated_minutes: DURATION_MIN,
    status: OrderStatusEnum.CONFIRMED,
    reschedule_count: 0,
  };

  const orderRepository = {
    findByIdForOwner: jest.fn(async () => order),
    findActiveByShifts: jest.fn(async () => options.busy),
    // The car's other bookings. Empty here: these tests are about shift
    // capacity, and the double-booking rule has its own coverage.
    findActiveByVehicle: jest.fn(async () => []),
    applyReschedule: jest.fn(
      async (
        _id: Types.ObjectId | string,
        staffShiftId: Types.ObjectId,
        scheduledAt: Date,
      ) => ({
        ...order,
        staff_shift_id: staffShiftId,
        scheduled_at: scheduledAt,
        reschedule_count: order.reschedule_count + 1,
      }),
    ),
  };

  const staffShiftRepository = {
    findById: jest.fn(async (id: string) =>
      options.shifts.find((s) => s._id.toString() === id),
    ),
    findShiftsContaining: jest.fn(async () => options.shifts),
  };

  const service = new OrderService(
    orderRepository as never,
    {} as never,
    {} as never,
    {} as never,
    { findById: jest.fn(async () => null) } as never,
    staffShiftRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, orderRepository, staffShiftRepository };
}

describe('OrderService.rescheduleOwn', () => {
  beforeEach(() => jest.clearAllMocks());

  it('picks a shift itself when the client sends none', async () => {
    // Shifts are anonymous and capacity-based: the customer picks a *time*,
    // never a washer shift. available-slots exposes no shift id, so demanding
    // one from the client made the endpoint uncallable.
    const h = makeHarness({ shifts: [shiftDoc(shiftId, 1)], busy: [] });
    const target = new Date(currentAt.getTime() + 2 * 3_600_000);

    const result = await h.service.rescheduleOwn(
      customerId.toString(),
      orderId.toString(),
      { scheduledAt: target },
    );

    expect(h.staffShiftRepository.findShiftsContaining).toHaveBeenCalled();
    expect(result.staffShiftId).toBe(shiftId.toString());
    expect(result.scheduledAt).toEqual(target);
  });

  it('still honours an explicit staffShiftId when one is supplied', async () => {
    const h = makeHarness({
      shifts: [shiftDoc(otherShiftId, 1)],
      busy: [],
    });
    const target = new Date(currentAt.getTime() + 2 * 3_600_000);

    const result = await h.service.rescheduleOwn(
      customerId.toString(),
      orderId.toString(),
      { staffShiftId: otherShiftId.toString(), scheduledAt: target },
    );

    expect(result.staffShiftId).toBe(otherShiftId.toString());
  });

  it('fills the second slot of a capacity-2 shift instead of calling it full', async () => {
    // createOrder compares against `capacity ?? 1`; reschedule used a
    // hard-coded 1, so a shift built to take two cars refused the second.
    const h = makeHarness({
      shifts: [shiftDoc(shiftId, 2)],
      busy: [
        {
          _id: new Types.ObjectId(),
          staff_shift_id: shiftId,
          scheduled_at: new Date(currentAt.getTime() + 2 * 3_600_000),
          estimated_minutes: DURATION_MIN,
        },
      ],
    });
    const target = new Date(currentAt.getTime() + 2 * 3_600_000);

    const result = await h.service.rescheduleOwn(
      customerId.toString(),
      orderId.toString(),
      { scheduledAt: target },
    );

    expect(result.scheduledAt).toEqual(target);
  });

  it('does not treat the order being moved as its own conflict', async () => {
    // Nudging 10:00 → 10:30 overlaps the order's own current window, so
    // counting itself made every small shift-internal move "full".
    const h = makeHarness({
      shifts: [shiftDoc(shiftId, 1)],
      busy: [
        {
          _id: orderId,
          staff_shift_id: shiftId,
          scheduled_at: currentAt,
          estimated_minutes: DURATION_MIN,
        },
      ],
    });
    const target = new Date(currentAt.getTime() + 30 * 60_000);

    const result = await h.service.rescheduleOwn(
      customerId.toString(),
      orderId.toString(),
      { scheduledAt: target },
    );

    expect(result.scheduledAt).toEqual(target);
  });

  it('rejects a time whose only shift is genuinely full', async () => {
    const h = makeHarness({
      shifts: [shiftDoc(shiftId, 1)],
      busy: [
        {
          _id: new Types.ObjectId(),
          staff_shift_id: shiftId,
          scheduled_at: new Date(currentAt.getTime() + 2 * 3_600_000),
          estimated_minutes: DURATION_MIN,
        },
      ],
    });

    await expect(
      h.service.rescheduleOwn(customerId.toString(), orderId.toString(), {
        scheduledAt: new Date(currentAt.getTime() + 2 * 3_600_000),
      }),
    ).rejects.toThrow(/full/i);
  });

  it('rejects a time no shift covers', async () => {
    const h = makeHarness({ shifts: [], busy: [] });

    await expect(
      h.service.rescheduleOwn(customerId.toString(), orderId.toString(), {
        scheduledAt: new Date(currentAt.getTime() + 2 * 3_600_000),
      }),
    ).rejects.toThrow(/shift/i);
  });
});
