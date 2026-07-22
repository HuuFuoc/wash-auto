/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { ShiftScheduleEnum } from '../../shared/staff-shift/types/shift-schedule.enum';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';
import { effectiveShiftStatus } from './staff-shift.model';
import { StaffShiftService } from './staff-shift.service';

// Socket emit is a best-effort side effect; stub it so tests can assert how many
// slots:changed emits fire without touching a real io instance.
jest.mock('../order/order.service', () => ({ emitSlotsChanged: jest.fn() }));
import { emitSlotsChanged } from '../order/order.service';
const emitMock = emitSlotsChanged as jest.Mock;

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

describe('StaffShiftService.bulkCreate', () => {
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

  // Repo whose createMany echoes the rows it was asked to insert as documents,
  // and whose overlap query returns `existing`.
  const makeRepo = (existing: unknown[] = []) => ({
    findOverlappingShifts: jest.fn(async () => existing),
    createMany: jest.fn(
      async (rows: Array<{ capacity: number; startAt: Date; endAt: Date }>) =>
        rows.map((r) =>
          shiftDoc({
            capacity: r.capacity,
            start_at: r.startAt,
            end_at: r.endAt,
          }),
        ),
    ),
  });

  beforeEach(() => emitMock.mockClear());

  it('creates one shift per day across the range, nothing skipped', async () => {
    const repo = makeRepo();
    const service = new StaffShiftService(repo as never, ...otherDeps);

    const result = await service.bulkCreate({
      fromDate: '2099-01-10',
      toDate: '2099-01-12',
      block: ShiftScheduleEnum.MORNING,
      capacity: 2,
    });

    expect(repo.createMany).toHaveBeenCalledTimes(1);
    expect(result.created).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.meta).toMatchObject({
      requestedDays: 3,
      createdCount: 3,
      skippedCount: 0,
    });
    expect(result.created[0].capacity).toBe(2);
  });

  it('fullday creates two shifts per day', async () => {
    const repo = makeRepo();
    const service = new StaffShiftService(repo as never, ...otherDeps);

    const result = await service.bulkCreate({
      fromDate: '2099-01-10',
      toDate: '2099-01-11',
      block: ShiftScheduleEnum.FULLDAY,
    });

    expect(result.created).toHaveLength(4); // 2 days × (morning + afternoon)
    expect(result.meta.createdCount).toBe(4);
  });

  it('skips days whose block already ended (reason: past)', async () => {
    const repo = makeRepo();
    const service = new StaffShiftService(repo as never, ...otherDeps);

    const result = await service.bulkCreate({
      fromDate: '2020-01-01',
      toDate: '2020-01-02',
      block: ShiftScheduleEnum.MORNING,
    });

    expect(result.created).toHaveLength(0);
    expect(repo.createMany).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => s.reason === 'past')).toBe(true);
  });

  it('skips days overlapping an existing shift (reason: overlap)', async () => {
    // A single wide existing shift covers the whole future window.
    const repo = makeRepo([
      shiftDoc({
        start_at: new Date('2099-01-01T00:00:00.000Z'),
        end_at: new Date('2099-12-31T23:59:59.000Z'),
      }),
    ]);
    const service = new StaffShiftService(repo as never, ...otherDeps);

    const result = await service.bulkCreate({
      fromDate: '2099-01-05',
      toDate: '2099-01-05',
      block: ShiftScheduleEnum.MORNING,
    });

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      date: '2099-01-05',
      block: 'morning',
      reason: 'overlap',
    });
  });

  it('filters by ISO weekday (Sat=6, Sun=7 over one week → 2 days)', async () => {
    const repo = makeRepo();
    const service = new StaffShiftService(repo as never, ...otherDeps);

    // Any 7 consecutive days contain exactly one of each weekday.
    const result = await service.bulkCreate({
      fromDate: '2099-01-05',
      toDate: '2099-01-11',
      block: ShiftScheduleEnum.MORNING,
      weekdays: [6, 7],
    });

    expect(result.meta.requestedDays).toBe(2);
    expect(result.created).toHaveLength(2);
  });

  it('emits slots:changed once per VN day (deduped)', async () => {
    const repo = makeRepo();
    const service = new StaffShiftService(repo as never, ...otherDeps);

    await service.bulkCreate({
      fromDate: '2099-01-10',
      toDate: '2099-01-11',
      block: ShiftScheduleEnum.FULLDAY, // 4 shifts, but only 2 distinct days
    });

    expect(emitMock).toHaveBeenCalledTimes(2);
  });

  it('rejects fromDate after toDate', async () => {
    const service = new StaffShiftService(makeRepo() as never, ...otherDeps);
    await expect(
      service.bulkCreate({
        fromDate: '2099-02-01',
        toDate: '2099-01-01',
        block: ShiftScheduleEnum.MORNING,
      }),
    ).rejects.toThrow('fromDate');
  });

  it('rejects a range longer than 92 days', async () => {
    const service = new StaffShiftService(makeRepo() as never, ...otherDeps);
    await expect(
      service.bulkCreate({
        fromDate: '2099-01-01',
        toDate: '2099-12-31',
        block: ShiftScheduleEnum.MORNING,
      }),
    ).rejects.toThrow('92');
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
