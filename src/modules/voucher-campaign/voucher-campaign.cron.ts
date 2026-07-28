import cron from 'node-cron';
import { VoucherCampaignService } from './voucher-campaign.service';

/**
 * LOCAL DEVELOPMENT ONLY — see the note in voucher-expiry.cron.ts. Production
 * drives the same two jobs through Vercel Cron.
 */
export function registerVoucherCampaignCrons(
  service: VoucherCampaignService,
): void {
  // Start SCHEDULED campaigns and retire finished ones, hourly. An hour of lag
  // on a campaign that runs for weeks is invisible to customers.
  cron.schedule('0 * * * *', () => {
    void (async () => {
      try {
        await service.sweepLifecycle();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Campaign lifecycle sweep failed: ${msg}`);
      }
    })();
  });

  // Repair cached spend counters from the redemption records, 02:30 VN time.
  // The counters are only an optimisation; this is what keeps them honest.
  cron.schedule(
    '30 2 * * *',
    () => {
      void (async () => {
        try {
          const result = await service.reconcileAllCounters();
          if (result.repaired > 0) {
            console.warn(
              `Campaign counter reconciliation repaired ${result.repaired}/${result.checked}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Campaign counter reconciliation failed: ${msg}`);
        }
      })();
    },
    { timezone: 'Asia/Ho_Chi_Minh' },
  );
}
