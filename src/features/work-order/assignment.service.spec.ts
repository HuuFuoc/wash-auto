import { Types } from 'mongoose';
import { UserRepository } from '../auth/repositories/user.repository';
import { StaffShiftRepository } from '../staff-shift/repositories/staff-shift.repository';
import { AssignmentService } from './assignment.service';
import { WorkOrderRepository } from './repositories/work-order.repository';

/**
 * Pure-logic unit tests for the assignment engine. The repositories are
 * mocked, so these exercise the eligibility intersection and the
 * preferred-or-idle-longest selection without a database.
 */
describe('AssignmentService', () => {
  let workOrderRepo: jest.Mocked<
    Pick<
      WorkOrderRepository,
      'findBusyWasherIds' | 'findLastFinishedAtByWashers'
    >
  >;
  let userRepo: jest.Mocked<Pick<UserRepository, 'findWasherIdsWithSkill'>>;
  let staffShiftRepo: jest.Mocked<
    Pick<StaffShiftRepository, 'findActiveWasherStaffIdsAt'>
  >;
  let service: AssignmentService;

  beforeEach(() => {
    workOrderRepo = {
      findBusyWasherIds: jest.fn(),
      findLastFinishedAtByWashers: jest.fn(),
    };
    userRepo = { findWasherIdsWithSkill: jest.fn() };
    staffShiftRepo = { findActiveWasherStaffIdsAt: jest.fn() };
    service = new AssignmentService(
      workOrderRepo as unknown as WorkOrderRepository,
      userRepo as unknown as UserRepository,
      staffShiftRepo as unknown as StaffShiftRepository,
      {} as never,
    );
  });

  describe('findEligibleFreeWasherIds', () => {
    const service_id = new Types.ObjectId();
    const vehicle_id = new Types.ObjectId();

    it('returns empty when no washer has the skill (no shift lookup)', async () => {
      userRepo.findWasherIdsWithSkill.mockResolvedValue([]);

      const result = await service.findEligibleFreeWasherIds(
        service_id,
        vehicle_id,
      );

      expect(result).toEqual([]);
      expect(staffShiftRepo.findActiveWasherStaffIdsAt).not.toHaveBeenCalled();
    });

    it('returns empty when no skilled washer is on an active shift', async () => {
      userRepo.findWasherIdsWithSkill.mockResolvedValue([new Types.ObjectId()]);
      staffShiftRepo.findActiveWasherStaffIdsAt.mockResolvedValue([]);

      const result = await service.findEligibleFreeWasherIds(
        service_id,
        vehicle_id,
      );

      expect(result).toEqual([]);
      expect(workOrderRepo.findBusyWasherIds).not.toHaveBeenCalled();
    });

    it('intersects skilled ∩ on-shift, then removes busy washers', async () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      userRepo.findWasherIdsWithSkill.mockResolvedValue([a, b]);
      staffShiftRepo.findActiveWasherStaffIdsAt.mockResolvedValue([a, b]);
      // `a` is busy → only `b` remains eligible.
      workOrderRepo.findBusyWasherIds.mockResolvedValue(
        new Set([a.toString()]),
      );

      const result = await service.findEligibleFreeWasherIds(
        service_id,
        vehicle_id,
      );

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
