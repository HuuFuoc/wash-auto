/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
import { Types } from 'mongoose';
import { AssignmentService } from './assignment.service';

// The lock helpers hit the shared ioredis singleton; stub it so claim() works
// without a live Redis connection.
jest.mock('../../core/redis', () => ({
  redisClient: {
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
  },
}));

/**
 * Assignment is shift-independent: any ACTIVE washer (role=washer) that is not
 * already busy can be auto-assigned or pulled, with no staff_shift required.
 */
describe('AssignmentService (shift-independent assignment)', () => {
  const roleId = new Types.ObjectId();
  const free = new Types.ObjectId();
  const busy = new Types.ObjectId();

  function build() {
    const workOrderRepository = {
      // busy washer reported busy only when present in the queried set
      findBusyWasherIds: jest.fn(
        async (ids: Array<Types.ObjectId | string>) =>
          new Set(ids.map(String).filter((id) => id === busy.toString())),
      ),
      findLastFinishedAtByWashers: jest.fn(async () => new Map<string, Date>()),
      claimForWasher: jest.fn(async () => ({ code: 'WO-1' })),
      findWaitingQueue: jest.fn(async () => []),
    };
    const userRepository = {
      findActiveIdsByRoleId: jest.fn(async () => [free, busy]),
    };
    const roleRepository = {
      findByCode: jest.fn(async () => ({ _id: roleId })),
    };

    const service = new AssignmentService(
      workOrderRepository as never,
      userRepository as never,
      roleRepository as never,
    );
    return { service, workOrderRepository, userRepository, roleRepository };
  }

  it('treats every active washer as eligible, no shift needed', async () => {
    const { service } = build();
    const eligible = await service.findEligibleFreeWasherIds();
    expect(eligible).toEqual([free.toString()]);
  });

  it('auto-assigns a WAITING work order to an active free washer', async () => {
    const { service, workOrderRepository } = build();
    const woId = new Types.ObjectId();
    const ok = await service.tryAutoAssign({
      _id: woId,
      preferred_washer_id: undefined,
    } as never);
    expect(ok).toBe(true);
    expect(workOrderRepository.claimForWasher).toHaveBeenCalledWith(
      woId,
      free.toString(),
    );
  });
});
