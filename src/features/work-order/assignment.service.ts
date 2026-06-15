import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { Types } from 'mongoose';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { StaffShiftRepository } from '../staff-shift/repositories/staff-shift.repository';
import { WorkOrderDocument } from './entities/work-order.entity';
import { WorkOrderRepository } from './repositories/work-order.repository';

/**
 * Decides which washer should service a checked-in car. A washer is eligible
 * for a job when they are on a washer shift covering right now (SCHEDULED or
 * ACTIVE) and free (not already tied up). Any washer on shift can service any
 * car - no manual clock-in to ACTIVE is required.
 *
 * Assignment is event-driven push: on check-in, when a washer frees up, and a
 * per-minute cron drain as a safety net. All claims funnel through an atomic
 * WAITING→ASSIGNED guard plus a per-washer Redis lock so a car is never handed
 * to two washers and a washer never gets two cars.
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private static readonly LOCK_TTL_SECONDS = 10;

  constructor(
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Washer ids eligible AND free for any job right now: on-shift ∩ not-busy.
   * Any washer on shift can service any car. Returned as id strings.
   */
  async findEligibleFreeWasherIds(now: Date = new Date()): Promise<string[]> {
    const onShift =
      await this.staffShiftRepository.findOnShiftWasherStaffIdsAt(now);
    if (onShift.length === 0) return [];

    const busy = await this.workOrderRepository.findBusyWasherIds(onShift);
    return onShift.map((id) => id.toString()).filter((id) => !busy.has(id));
  }

  /**
   * Chooses a washer from an eligible set: the booking-preferred washer when
   * still eligible, otherwise the one idle the longest (oldest last finish;
   * never-finished counts as most idle).
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

  /**
   * Attempts to assign a single WAITING work order to an eligible washer.
   * Returns true if it was claimed. A no-op when nothing is eligible/free —
   * the ticket stays WAITING and is picked up later when a washer frees up.
   */
  async tryAutoAssign(wo: WorkOrderDocument): Promise<boolean> {
    const eligible = await this.findEligibleFreeWasherIds();
    const washerId = await this.pickWasher(
      eligible,
      wo.preferred_washer_id?.toString(),
    );
    if (!washerId) return false;
    return this.claim(wo._id, washerId);
  }

  /**
   * Called when a washer frees up: hands them the front-of-FIFO WAITING car
   * (earliest appointment, then earliest arrival). Any washer on shift can
   * service any car.
   */
  async tryPullNextForWasher(
    washerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const idStr = washerId.toString();
    const lockKey = this.lockKey(idStr);
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) return false;
    try {
      // Still free + on shift right now?
      const busy = await this.workOrderRepository.findBusyWasherIds([idStr]);
      if (busy.has(idStr)) return false;
      const onShift =
        await this.staffShiftRepository.findOnShiftWasherStaffIdsAt(
          new Date(),
          [new Types.ObjectId(idStr)],
        );
      if (onShift.length === 0) return false;

      const [next] = await this.workOrderRepository.findWaitingQueue(1);
      if (!next) return false;

      const claimed = await this.workOrderRepository.claimForWasher(
        next._id,
        idStr,
      );
      if (claimed) {
        this.logger.log(
          `Pulled ${claimed.code} → washer ${idStr} (washer freed up)`,
        );
      }
      return !!claimed;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * Drains the WAITING queue in FIFO order, assigning each ticket to an
   * eligible free washer if one exists. Safety net / catch-up (e.g. a washer
   * just clocked in) run from a per-minute cron. Returns the number assigned.
   */
  async drainQueue(limit = 100): Promise<number> {
    const queue = await this.workOrderRepository.findWaitingQueue(limit);
    let assigned = 0;
    for (const wo of queue) {
      if (await this.tryAutoAssign(wo)) assigned++;
    }
    return assigned;
  }

  /**
   * Guard for manual assignment: throws when the washer is not on shift right
   * now (no SCHEDULED/ACTIVE washer shift covering the moment). Any washer on
   * shift can service any car. (The free / role checks live in
   * WorkOrderService.assignWasher.)
   */
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

  /**
   * Claims a WAITING ticket for a washer under a per-washer lock, re-checking
   * the washer is still free inside the lock. Returns true on success.
   */
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
        this.logger.log(`Auto-assigned ${claimed.code} → washer ${washerId}`);
      }
      return !!claimed;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private lockKey(washerId: string): string {
    return `lock:assign:washer:${washerId}`;
  }

  private async acquireLock(key: string): Promise<boolean> {
    const res = await this.redis.set(
      key,
      '1',
      'EX',
      AssignmentService.LOCK_TTL_SECONDS,
      'NX',
    );
    return res !== null;
  }
}
