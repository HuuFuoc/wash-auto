/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { StaffShiftService } from './staff-shift.service';

describe('StaffShiftService.staffPerformance', () => {
  it('merges shift, work-order and feedback stats per washer', async () => {
    const w1 = new Types.ObjectId();
    const w2 = new Types.ObjectId();

    const roleRepository = {
      findByCode: jest.fn(async () => ({ _id: new Types.ObjectId() })),
    };
    const userRepository = {
      findPaginated: jest.fn(async () => [
        { _id: w1, name: 'Washer One', is_active: true },
        { _id: w2, name: 'Washer Two', is_active: false },
      ]),
    };
    const workOrderRepository = {
      washerWorkStats: jest.fn(
        async () =>
          new Map([[w1.toString(), { carsWashed: 5, ordersHandled: 6 }]]),
      ),
    };
    const feedbackRepository = {
      summaryByWashers: jest.fn(
        async () =>
          new Map([[w1.toString(), { count: 3, averageRating: 4.7 }]]),
      ),
    };
    const repository = {
      countShiftsByStaff: jest.fn(async () => new Map([[w1.toString(), 9]])),
    };

    const service = new StaffShiftService(
      repository as never,
      userRepository as never,
      roleRepository as never,
      workOrderRepository as never,
      feedbackRepository as never,
    );

    const rows = await service.staffPerformance({});
    expect(rows).toHaveLength(2);

    const one = rows.find((r) => r.washerId === w1.toString())!;
    expect(one).toMatchObject({
      name: 'Washer One',
      isActive: true,
      shiftsCount: 9,
      carsWashed: 5,
      ordersHandled: 6,
      feedbackCount: 3,
      averageRating: 4.7,
    });

    // Washer with no stats falls back to zeros.
    const two = rows.find((r) => r.washerId === w2.toString())!;
    expect(two).toMatchObject({
      isActive: false,
      shiftsCount: 0,
      carsWashed: 0,
      feedbackCount: 0,
      averageRating: 0,
    });
  });
});
