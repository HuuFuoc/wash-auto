import cron from 'node-cron';
import { config } from '../../config';
import { OrderService } from './order.service';

/**
 * Replaces features/order/jobs/{order-expiry,cash-no-show}.cron.ts (@Cron
 * EVERY_MINUTE via @nestjs/schedule). Registered once from the server
 * bootstrap.
 *   - order-expiry: auto-cancel PENDING_PAYMENT orders past the payment window.
 *   - cash-no-show: auto-mark CONFIRMED+CASH+UNPAID orders NO_SHOW past grace.
 */
export function registerOrderCrons(service: OrderService): void {
  // Auto-cancel expired pending-payment orders, every minute.
  cron.schedule('* * * * *', () => {
    void (async () => {
      const minutes = config.booking.paymentTimeoutMinutes;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      try {
        const expired = await service.expirePendingPayment(cutoff);
        if (expired.length > 0) {
          console.log(
            `Auto-cancelled ${expired.length} orders (cutoff=${cutoff.toISOString()})`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Auto-cancel sweep failed: ${msg}`);
      }
    })();
  });

  // Auto-mark unconfirmed cash orders as NO_SHOW past the grace window, every minute.
  cron.schedule('* * * * *', () => {
    void (async () => {
      const minutes = config.booking.cashArrivalGraceMinutes;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      try {
        const expired = await service.expireUnconfirmedCash(cutoff);
        if (expired.length > 0) {
          console.log(
            `Auto-marked ${expired.length} cash orders NO_SHOW (cutoff=${cutoff.toISOString()})`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cash no-show sweep failed: ${msg}`);
      }
    })();
  });
}
