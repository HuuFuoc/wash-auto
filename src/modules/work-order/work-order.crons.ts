import cron from 'node-cron';
import { AssignmentService } from './assignment.service';

/**
 * Replaces features/work-order/jobs/queue-drain.cron.ts (@Cron EVERY_MINUTE via
 * @nestjs/schedule). Safety-net drain of the WAITING work-order queue —
 * catches anything the push triggers (check-in, washer-frees-up) miss,
 * e.g. a washer clocking in while cars are already waiting.
 */
export function registerWorkOrderCron(
  assignmentService: AssignmentService,
): void {
  cron.schedule('* * * * *', () => {
    void (async () => {
      try {
        const assigned = await assignmentService.drainQueue();
        if (assigned > 0) {
          console.log(`Queue drain auto-assigned ${assigned} work order(s)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Queue drain failed: ${msg}`);
      }
    })();
  });
}
