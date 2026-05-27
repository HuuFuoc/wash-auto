import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoyaltyService } from '../loyalty.service';

/**
 * Resets every customer's loyalty_points and toward-voucher counter at the
 * stroke of Jan 1st in Asia/Ho_Chi_Minh, demoting all accounts back to None.
 * Lifetime total_successful_washes is intentionally preserved so historical
 * customer stats remain visible.
 */
@Injectable()
export class LoyaltyAnnualResetCron {
  private readonly logger = new Logger(LoyaltyAnnualResetCron.name);

  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Cron('0 0 1 1 *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async run(): Promise<void> {
    try {
      const result = await this.loyaltyService.annualReset();
      this.logger.log(`Annual reset finished accounts=${result.resetCount}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Annual reset failed: ${msg}`);
    }
  }
}
