import cron from 'node-cron';
import { VoucherService } from './voucher.service';

/**
 * Replaces features/voucher/jobs/voucher-expiry.cron.ts (@Cron via
 * @nestjs/schedule). Sweeps UNUSED vouchers past their deadline to EXPIRED,
 * daily at 02:00 Asia/Ho_Chi_Minh. Registered once from the server bootstrap.
 */
export function registerVoucherExpiryCron(service: VoucherService): void {
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
}
