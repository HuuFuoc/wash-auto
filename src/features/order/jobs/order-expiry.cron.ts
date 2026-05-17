import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from '../services/order.service';

/**
 * Auto-cancels PENDING_PAYMENT orders whose payment window has elapsed.
 * Runs every minute. Idempotent — safe to overlap if the previous run
 * was slow.
 */
@Injectable()
export class OrderExpiryCron {
  private readonly logger = new Logger(OrderExpiryCron.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const minutes = this.config.getOrThrow<number>(
      'booking.paymentTimeoutMinutes',
    );
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    try {
      const expired = await this.orderService.expirePendingPayment(cutoff);
      if (expired.length > 0) {
        this.logger.log(
          `Auto-cancelled ${expired.length} orders (cutoff=${cutoff.toISOString()})`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Auto-cancel sweep failed: ${msg}`);
    }
  }
}
