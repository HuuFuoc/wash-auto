import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VoucherService } from '../voucher.service';

/**
 * Sweeps UNUSED vouchers whose `expires_at` has passed and flips them to
 * EXPIRED. Runs once a day at 02:00 Asia/Ho_Chi_Minh so the work is done in
 * the quiet window before the morning service starts.
 *
 * The voucher consume path already filters on `expires_at > now` defensively,
 * so a delayed cron run cannot cause a customer to redeem an expired voucher
 * — this job exists to keep listing/reporting tidy.
 */
@Injectable()
export class VoucherExpiryCron {
  private readonly logger = new Logger(VoucherExpiryCron.name);

  constructor(private readonly voucherService: VoucherService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: 'Asia/Ho_Chi_Minh' })
  async sweep(): Promise<void> {
    try {
      const expired = await this.voucherService.expireDue();
      if (expired > 0) {
        this.logger.log(`Voucher expiry sweep flipped ${expired} vouchers`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voucher expiry sweep failed: ${msg}`);
    }
  }
}
