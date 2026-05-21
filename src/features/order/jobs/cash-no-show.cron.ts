import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from '../services/order.service';

/**
 * Auto-marks CONFIRMED + CASH + UNPAID orders as NO_SHOW once the
 * configured grace window after `scheduled_at` has elapsed without the
 * customer arriving (cashier did not move the order past CONFIRMED).
 * Runs every minute. Idempotent.
 */
@Injectable()
export class CashNoShowCron {
  private readonly logger = new Logger(CashNoShowCron.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const minutes = this.config.getOrThrow<number>(
      'booking.cashArrivalGraceMinutes',
    );
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    try {
      const expired = await this.orderService.expireUnconfirmedCash(cutoff);
      if (expired.length > 0) {
        this.logger.log(
          `Auto-marked ${expired.length} cash orders NO_SHOW (cutoff=${cutoff.toISOString()})`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cash no-show sweep failed: ${msg}`);
    }
  }
}
