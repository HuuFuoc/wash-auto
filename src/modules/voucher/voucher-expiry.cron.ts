import cron from 'node-cron';
import { VoucherService } from './voucher.service';

/**
 * LOCAL DEVELOPMENT ONLY.
 *
 * node-cron needs a long-lived process. Production runs on Vercel, where the
 * instance is frozen between requests and these timers never fire — there, the
 * same work is driven over HTTP by Vercel Cron (see `vercel.json` and
 * `modules/jobs/jobs.router.ts`). Both jobs are idempotent, so a machine running
 * both schedules simply does the work twice with no ill effect.
 */
export function registerVoucherExpiryCron(service: VoucherService): void {
  // Sweep UNUSED vouchers past their deadline to EXPIRED, 02:00 VN time.
  cron.schedule(
    '0 2 * * *',
    () => {
      void (async () => {
        try {
          const expired = await service.expireDue();
          if (expired > 0) {
            console.log(`Voucher expiry sweep flipped ${expired} vouchers`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Voucher expiry sweep failed: ${msg}`);
        }
      })();
    },
    { timezone: 'Asia/Ho_Chi_Minh' },
  );

  // Release holds whose payment window lapsed. Runs every 5 minutes: a voucher
  // stuck on an abandoned checkout is unusable until this frees it, so the delay
  // is felt directly by the customer.
  cron.schedule('*/5 * * * *', () => {
    void (async () => {
      try {
        await service.sweepExpiredReservations();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Voucher reservation sweep failed: ${msg}`);
      }
    })();
  });
}
