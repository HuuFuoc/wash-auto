import { Types } from 'mongoose';
import { StaffShiftRepository } from '../staff-shift/repositories/staff-shift.repository';
import { AssignmentService } from './assignment.service';
import { WorkOrderRepository } from './repositories/work-order.repository';

/**
 * Pure-logic unit tests for the assignment engine. The repositories are
 * mocked, so these exercise the eligibility (on-shift ∩ free) intersection and
 * the preferred-or-idle-longest selection without a database. Any washer on an
 * active shift can service any car - there is no skill gate.
 */
describe('AssignmentService', () => {
  let workOrderRepo: jest.Mocked<
    Pick<
      WorkOrderRepository,
      'findBusyWasherIds' | 'findLastFinishedAtByWashers'
    >
  >;
  let staffShiftRepo: jest.Mocked<
    Pick<StaffShiftRepository, 'findActiveWasherStaffIdsAt'>
  >;
  let service: AssignmentService;

  beforeEach(() => {
    workOrderRepo = {
      findBusyWasherIds: jest.fn(),
      findLastFinishedAtByWashers: jest.fn(),
    };
    staffShiftRepo = { findActiveWasherStaffIdsAt: jest.fn() };
    service = new AssignmentService(
      workOrderRepo as unknown as WorkOrderRepository,
      staffShiftRepo as unknown as StaffShiftRepository,
      {} as never,
    );
  });

  describe('findEligibleFreeWasherIds', () => {
    it('returns empty when no washer is on an active shift (no busy lookup)', async () => {
      staffShiftRepo.findActiveWasherStaffIdsAt.mockResolvedValue([]);

      const result = await service.findEligibleFreeWasherIds();

      expect(result).toEqual([]);
      expect(workOrderRepo.findBusyWasherIds).not.toHaveBeenCalled();
    });

    it('returns every on-shift washer when none are busy', async () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      staffShiftRepo.findActiveWasherStaffIdsAt.mockResolvedValue([a, b]);
      workOrderRepo.findBusyWasherIds.mockResolvedValue(new Set());

      const result = await service.findEligibleFreeWasherIds();

      expect(result).toEqual([a.toString(), b.toString()]);
    });

    it('removes busy washers from the on-shift set', async () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      staffShiftRepo.findActiveWasherStaffIdsAt.mockResolvedValue([a, b]);
      // `a` is busy → only `b` remains eligible.
      workOrderRepo.findBusyWasherIds.mockResolvedValue(
        new Set([a.toString()]),
      );

      const result = await service.findEligibleFreeWasherIds();

      expect(result).toEqual([b.toString()]);
    });
  });

  describe('pickWasher', () => {
    it('returns null for an empty set', async () => {
      expect(await service.pickWasher([])).toBeNull();
    });

    it('prefers the booking-preferred washer when still eligible', async () => {
      const result = await service.pickWasher(['w1', 'w2', 'w3'], 'w2');
      expect(result).toBe('w2');
      expect(workOrderRepo.findLastFinishedAtByWashers).not.toHaveBeenCalled();
    });

    it('falls back to idle-longest when the preferred washer is not eligible', async () => {
      // w1 finished most recently, w2 longer ago → w2 is idle-longest.
      workOrderRepo.findLastFinishedAtByWashers.mockResolvedValue(
        new Map([
          ['w1', new Date('2026-06-12T10:00:00Z')],
          ['w2', new Date('2026-06-12T08:00:00Z')],
        ]),
      );

      const result = await service.pickWasher(['w1', 'w2'], 'gone');

      expect(result).toBe('w2');
    });

    it('treats a never-finished washer as most idle', async () => {
      // w1 has a finish time; w3 has none → w3 wins.
      workOrderRepo.findLastFinishedAtByWashers.mockResolvedValue(
        new Map([['w1', new Date('2026-06-12T08:00:00Z')]]),
      );

      const result = await service.pickWasher(['w1', 'w3']);

      expect(result).toBe('w3');
    });
  });
});
