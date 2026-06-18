import cron from 'node-cron';
import { LoyaltyService } from './loyalty.service';

/**
 * Replaces features/loyalty/jobs/loyalty-annual-reset.cron.ts. Resets every
 * customer's points + voucher counters at 00:00 Jan 1st Asia/Ho_Chi_Minh,
 * demoting all accounts to None. Registered once from the server bootstrap.
 */
export function registerLoyaltyAnnualResetCron(service: LoyaltyService): void {
  cron.schedule(
    '0 0 1 1 *',
    () => {
      void (async () => {
        try {
          const result = await service.annualReset();
          console.log(`Annual reset finished accounts=${result.resetCount}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Annual reset failed: ${msg}`);
        }
      })();
    },
    { timezone: 'Asia/Ho_Chi_Minh' },
  );
}
