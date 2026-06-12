import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssignmentService } from '../assignment.service';

/**
 * Safety-net drain of the WAITING work-order queue. The push triggers
 * (check-in, washer-frees-up) cover the common cases; this catches anything
 * they miss — most importantly a washer clocking in (shift → ACTIVE) while
 * cars are already waiting. Runs every minute; idempotent.
 */
@Injectable()
export class QueueDrainCron {
  private readonly logger = new Logger(QueueDrainCron.name);

  constructor(private readonly assignmentService: AssignmentService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async drain(): Promise<void> {
    try {
      const assigned = await this.assignmentService.drainQueue();
      if (assigned > 0) {
        this.logger.log(`Queue drain auto-assigned ${assigned} work order(s)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Queue drain failed: ${msg}`);
    }
  }
}
