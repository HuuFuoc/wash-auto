import { Types } from 'mongoose';
import { redisClient } from '../../core/redis';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { WorkOrderDocument } from './work-order.model';
import { WorkOrderRepository } from './work-order.repository';

// Auto-assign is shift-independent: any active washer (role=washer) that is not
// already busy is eligible. Managers schedule shifts for planning/booking, but
// a shift is NOT required to take a job.
export class AssignmentService {
  private static readonly LOCK_TTL_SECONDS = 10;

  constructor(
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

  /** All active washer ids, regardless of shift. The assignable pool. */
  private async findActiveWasherIds(): Promise<Types.ObjectId[]> {
    const role = await this.roleRepository.findByCode(RoleEnum.WASHER);
    if (!role) return [];
    return this.userRepository.findActiveIdsByRoleId(role._id);
  }

  /** Washer ids eligible AND free for any job right now: active ∩ not-busy. */
  async findEligibleFreeWasherIds(): Promise<string[]> {
    const washers = await this.findActiveWasherIds();
    if (washers.length === 0) return [];

    const busy = await this.workOrderRepository.findBusyWasherIds(washers);
    return washers.map((id) => id.toString()).filter((id) => !busy.has(id));
  }

  /**
   * Chooses a washer from an eligible set: the booking-preferred washer when
   * still eligible, otherwise the one idle the longest.
   */
  async pickWasher(
    eligibleIds: string[],
    preferredId?: string,
  ): Promise<string | null> {
    if (eligibleIds.length === 0) return null;
    if (preferredId && eligibleIds.includes(preferredId)) return preferredId;

    const lastFinished =
      await this.workOrderRepository.findLastFinishedAtByWashers(eligibleIds);
    return [...eligibleIds].sort((a, b) => {
      const ta = lastFinished.get(a)?.getTime() ?? 0;
      const tb = lastFinished.get(b)?.getTime() ?? 0;
      return ta - tb;
    })[0];
  }

  /** Attempts to assign a single WAITING work order to an eligible washer. */
  async tryAutoAssign(wo: WorkOrderDocument): Promise<boolean> {
    const eligible = await this.findEligibleFreeWasherIds();
    const washerId = await this.pickWasher(
      eligible,
      wo.preferred_washer_id?.toString(),
    );
    if (!washerId) return false;
    return this.claim(wo._id, washerId);
  }

  /** Called when a washer frees up: hands them the front-of-FIFO WAITING car. */
  async tryPullNextForWasher(
    washerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const idStr = washerId.toString();
    const lockKey = this.lockKey(idStr);
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) return false;
    try {
      const busy = await this.workOrderRepository.findBusyWasherIds([idStr]);
      if (busy.has(idStr)) return false;

      const [next] = await this.workOrderRepository.findWaitingQueue(1);
      if (!next) return false;

      const claimed = await this.workOrderRepository.claimForWasher(
        next._id,
        idStr,
      );
      if (claimed) {
        console.log(
          `Pulled ${claimed.code} → washer ${idStr} (washer freed up)`,
        );
      }
      return !!claimed;
    } finally {
      await redisClient.del(lockKey);
    }
  }

  /** Drains the WAITING queue in FIFO order. Returns the number assigned. */
  async drainQueue(limit = 100): Promise<number> {
    const queue = await this.workOrderRepository.findWaitingQueue(limit);
    let assigned = 0;
    for (const wo of queue) {
      if (await this.tryAutoAssign(wo)) assigned++;
    }
    return assigned;
  }

  // ---------- helpers ----------

  private async claim(
    woId: Types.ObjectId,
    washerId: string,
  ): Promise<boolean> {
    const lockKey = this.lockKey(washerId);
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) return false;
    try {
      const busy = await this.workOrderRepository.findBusyWasherIds([washerId]);
      if (busy.has(washerId)) return false;
      const claimed = await this.workOrderRepository.claimForWasher(
        woId,
        washerId,
      );
      if (claimed) {
        console.log(`Auto-assigned ${claimed.code} → washer ${washerId}`);
      }
      return !!claimed;
    } finally {
      await redisClient.del(lockKey);
    }
  }

  private lockKey(washerId: string): string {
    return `lock:assign:washer:${washerId}`;
  }

  private async acquireLock(key: string): Promise<boolean> {
    const res = await redisClient.set(
      key,
      '1',
      'EX',
      AssignmentService.LOCK_TTL_SECONDS,
      'NX',
    );
    return res !== null;
  }
}
