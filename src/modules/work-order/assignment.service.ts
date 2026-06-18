import { Types } from 'mongoose';
import { BadRequestException } from '../../common/exceptions';
import { redisClient } from '../../core/redis';
import { StaffShiftRepository } from '../staff-shift/staff-shift.repository';
import { WorkOrderDocument } from './work-order.model';
import { WorkOrderRepository } from './work-order.repository';

// Business logic copied verbatim from features/work-order/assignment.service.ts;
// only DI (REDIS_CLIENT) + Logger were swapped out.
export class AssignmentService {
  private static readonly LOCK_TTL_SECONDS = 10;

  constructor(
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
  ) {}

  /** Washer ids eligible AND free for any job right now: on-shift ∩ not-busy. */
  async findEligibleFreeWasherIds(now: Date = new Date()): Promise<string[]> {
    const onShift =
      await this.staffShiftRepository.findOnShiftWasherStaffIdsAt(now);
    if (onShift.length === 0) return [];

    const busy = await this.workOrderRepository.findBusyWasherIds(onShift);
    return onShift.map((id) => id.toString()).filter((id) => !busy.has(id));
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
      const onShift =
        await this.staffShiftRepository.findOnShiftWasherStaffIdsAt(new Date(), [
          new Types.ObjectId(idStr),
        ]);
      if (onShift.length === 0) return false;

      const [next] = await this.workOrderRepository.findWaitingQueue(1);
      if (!next) return false;

      const claimed = await this.workOrderRepository.claimForWasher(
        next._id,
        idStr,
      );
      if (claimed) {
        console.log(`Pulled ${claimed.code} → washer ${idStr} (washer freed up)`);
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

  /** Guard for manual assignment: throws when the washer is not on shift now. */
  async assertWasherCanTake(washerId: string): Promise<void> {
    const onShift = await this.staffShiftRepository.findOnShiftWasherStaffIdsAt(
      new Date(),
      [new Types.ObjectId(washerId)],
    );
    if (onShift.length === 0) {
      throw new BadRequestException('Washer is not on shift right now');
    }
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
