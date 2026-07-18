/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { ShiftScheduleEnum } from '../../shared/staff-shift/types/shift-schedule.enum';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';
import { effectiveShiftStatus } from './staff-shift.model';
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

describe('effectiveShiftStatus', () => {
  const at = (iso: string) => new Date(iso);
  const window = {
    start_at: at('2026-06-01T01:00:00.000Z'),
    end_at: at('2026-06-01T05:00:00.000Z'),
  };

  it('derives scheduled → active → completed from the clock', () => {
    const shift = { status: ShiftStatusEnum.SCHEDULED, ...window };
    expect(effectiveShiftStatus(shift, at('2026-06-01T00:30:00.000Z'))).toBe(
      ShiftStatusEnum.SCHEDULED,
    );
    expect(effectiveShiftStatus(shift, at('2026-06-01T03:00:00.000Z'))).toBe(
      ShiftStatusEnum.ACTIVE,
    );
    expect(effectiveShiftStatus(shift, at('2026-06-01T05:00:00.000Z'))).toBe(
      ShiftStatusEnum.COMPLETED,
    );
  });

  it('cancelled always wins over the clock', () => {
    const shift = { status: ShiftStatusEnum.CANCELLED, ...window };
    expect(effectiveShiftStatus(shift, at('2026-06-01T03:00:00.000Z'))).toBe(
      ShiftStatusEnum.CANCELLED,
    );
  });
});

describe('StaffShiftService anonymous shifts', () => {
  const otherDeps = [
    {} as never, // userRepository
    {} as never, // roleRepository
    {} as never, // workOrderRepository
    {} as never, // feedbackRepository
  ] as const;

  const shiftDoc = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    shift_type: ShiftTypeEnum.WASHER,
    capacity: 1,
    start_at: new Date('2099-01-01T01:00:00.000Z'),
    end_at: new Date('2099-01-01T05:00:00.000Z'),
    status: ShiftStatusEnum.SCHEDULED,
    ...over,
  });

  it('fullday creates two anonymous shifts carrying the capacity', async () => {
    const repository = {
      findOverlappingShifts: jest.fn(async () => []),
      create: jest.fn(
        async (input: { capacity: number; startAt: Date; endAt: Date }) =>
          shiftDoc({
            capacity: input.capacity,
            start_at: input.startAt,
            end_at: input.endAt,
          }),
      ),
    };
    const service = new StaffShiftService(repository as never, ...otherDeps);

    const rows = await service.create({
      date: '2099-01-01',
      block: ShiftScheduleEnum.FULLDAY,
      capacity: 3,
    });

    expect(rows).toHaveLength(2);
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(rows[0].capacity).toBe(3);
    expect(rows[0].staffId).toBeUndefined();
    expect(rows[0].status).toBe(ShiftStatusEnum.SCHEDULED);
  });

  it('rejects a shift overlapping an existing one', async () => {
    const repository = {
      findOverlappingShifts: jest.fn(async () => [shiftDoc()]),
      create: jest.fn(),
    };
    const service = new StaffShiftService(repository as never, ...otherDeps);

    await expect(
      service.create({ date: '2099-01-01', block: ShiftScheduleEnum.MORNING }),
    ).rejects.toThrow('Đã có ca làm việc trong khung giờ này');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('setStatus only accepts cancelled', async () => {
    const service = new StaffShiftService({} as never, ...otherDeps);
    await expect(
      service.setStatus(new Types.ObjectId().toString(), {
        status: ShiftStatusEnum.ACTIVE,
      }),
    ).rejects.toThrow('time-derived');
  });

  it('refuses to cancel a shift that already ended', async () => {
    const past = shiftDoc({
      start_at: new Date('2020-01-01T01:00:00.000Z'),
      end_at: new Date('2020-01-01T05:00:00.000Z'),
    });
    const repository = { findById: jest.fn(async () => past) };
    const service = new StaffShiftService(repository as never, ...otherDeps);

    await expect(
      service.setStatus(past._id.toString(), {
        status: ShiftStatusEnum.CANCELLED,
      }),
    ).rejects.toThrow('already ended');
  });

  it('cancels a live shift', async () => {
    const doc = shiftDoc();
    const repository = {
      findById: jest.fn(async () => doc),
      setStatus: jest.fn(async () =>
        shiftDoc({ _id: doc._id, status: ShiftStatusEnum.CANCELLED }),
      ),
    };
    const service = new StaffShiftService(repository as never, ...otherDeps);

    const dto = await service.setStatus(doc._id.toString(), {
      status: ShiftStatusEnum.CANCELLED,
    });
    expect(repository.setStatus).toHaveBeenCalledWith(
      doc._id.toString(),
      ShiftStatusEnum.CANCELLED,
    );
    expect(dto.status).toBe(ShiftStatusEnum.CANCELLED);
  });
});

describe('StaffShiftService.washerLiveStatus', () => {
  const makeService = (overrides: {
    washers: Array<{ _id: Types.ObjectId; name: string }>;
    activeWork?: unknown[];
    onShiftIds?: Types.ObjectId[];
  }) => {
    const roleRepository = {
      findByCode: jest.fn(async () => ({ _id: new Types.ObjectId() })),
    };
    const userRepository = {
      findPaginated: jest.fn(async () =>
        overrides.washers.map((w) => ({
          ...w,
          email: `${w.name}@x.local`,
          avatar_url: undefined,
          is_active: true,
        })),
      ),
    };
    const workOrderRepository = {
      findActiveByWashers: jest.fn(async () => overrides.activeWork ?? []),
    };
    const repository = {
      // Legacy per-staff shifts: one live shift doc per on-shift washer.
      findShiftsContaining: jest.fn(async () =>
        (overrides.onShiftIds ?? []).map((id) => ({ staff_id: id })),
      ),
    };
    return new StaffShiftService(
      repository as never,
      userRepository as never,
      roleRepository as never,
      workOrderRepository as never,
      {} as never,
    );
  };

  const ticket = (
    washerId: Types.ObjectId,
    status: string,
    extra: Record<string, unknown> = {},
  ) => ({
    _id: new Types.ObjectId(),
    assigned_washer_id: washerId,
    status,
    code: 'WO-1',
    vehicle_snapshot: { plate: '51K-123.45', vehicle_type_name: 'SUV' },
    service_name: 'Rửa cơ bản',
    scheduled_at: new Date('2026-07-18T02:00:00Z'),
    estimated_minutes: 45,
    started_at: undefined,
    station_name: undefined,
    ...extra,
  });

  it('prefers IN_PROGRESS over ASSIGNED and maps ticket fields', async () => {
    const w1 = new Types.ObjectId();
    const started = new Date('2026-07-18T03:00:00Z');
    const service = makeService({
      washers: [{ _id: w1, name: 'Washer One' }],
      activeWork: [
        ticket(w1, 'assigned'),
        ticket(w1, 'in_progress', { code: 'WO-2', started_at: started }),
      ],
      onShiftIds: [w1],
    });

    const rows = await service.washerLiveStatus();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      washerId: w1.toString(),
      status: 'in_progress',
      onShift: true,
    });
    expect(rows[0].currentWorkOrder).toMatchObject({
      code: 'WO-2',
      plate: '51K-123.45',
      serviceName: 'Rửa cơ bản',
      startedAt: started,
      estimatedMinutes: 45,
    });
  });

  it('reports assigned washers and free/off-shift washers correctly', async () => {
    const busy = new Types.ObjectId();
    const idle = new Types.ObjectId();
    const service = makeService({
      washers: [
        { _id: busy, name: 'Busy' },
        { _id: idle, name: 'Idle' },
      ],
      activeWork: [ticket(busy, 'assigned')],
      onShiftIds: [busy],
    });

    const rows = await service.washerLiveStatus();
    const busyRow = rows.find((r) => r.washerId === busy.toString())!;
    expect(busyRow.status).toBe('assigned');
    expect(busyRow.onShift).toBe(true);
    expect(busyRow.currentWorkOrder?.startedAt).toBeNull();

    const idleRow = rows.find((r) => r.washerId === idle.toString())!;
    expect(idleRow).toMatchObject({
      status: 'free',
      onShift: false,
      currentWorkOrder: null,
    });
  });

  it('returns [] when the washer role is not seeded', async () => {
    const service = new StaffShiftService(
      {} as never,
      {} as never,
      { findByCode: jest.fn(async () => null) } as never,
      {} as never,
      {} as never,
    );
    expect(await service.washerLiveStatus()).toEqual([]);
  });
});
