import { NextFunction, Request, Response, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { asyncHandler } from '../../common/async-handler';
import { HttpException } from '../../common/http-exception';
import { config } from '../../config';
import { loyaltyService } from '../loyalty/loyalty.router';
import { orderService } from '../order/order.router';
import { voucherService } from '../voucher/voucher.router';
import { voucherCampaignService } from '../voucher-campaign/voucher-campaign.router';

/**
 * HTTP entrypoints for the scheduled jobs.
 *
 * `node-cron` only fires inside a long-lived process. Production runs on Vercel,
 * where the instance is frozen between requests, so those timers never tick —
 * which means the voucher-expiry, reservation-sweep and annual-reset jobs have
 * effectively not been running in production at all. Vercel Cron calls these
 * routes instead (see vercel.json); `server.ts` keeps its node-cron schedule for
 * local development, and every job is idempotent so both firing is harmless.
 *
 * Deliberately mounted OUTSIDE the auth middleware: the caller is Vercel's
 * scheduler, not a user. Authorisation is a shared secret compared in constant
 * time, and an unset secret disables the endpoint rather than leaving it open.
 */
type JobRunner = () => Promise<unknown>;

const JOBS: Record<string, JobRunner> = {
  /** Flip UNUSED vouchers past their deadline to EXPIRED. */
  'voucher-expiry': () => voucherService.expireDue(),

  /** Give back holds whose payment window lapsed. */
  'voucher-reservation-sweep': () => voucherService.sweepExpiredReservations(),

  /** Start SCHEDULED campaigns, retire ones past their end date. */
  'campaign-lifecycle': () => voucherCampaignService.sweepLifecycle(),

  /** Repair cached campaign counters from the redemption records. */
  'campaign-reconcile': () => voucherCampaignService.reconcileAllCounters(),

  /** Auto-cancel PENDING_PAYMENT orders past the payment window. */
  'order-expiry': async () => {
    const cutoff = new Date(
      Date.now() - config.booking.paymentTimeoutMinutes * 60_000,
    );
    return {
      cancelled: (await orderService.expirePendingPayment(cutoff)).length,
    };
  },

  /** Auto-mark unclaimed cash bookings as NO_SHOW past the grace window. */
  'cash-no-show': async () => {
    const cutoff = new Date(
      Date.now() - config.booking.cashArrivalGraceMinutes * 60_000,
    );
    return {
      noShow: (await orderService.expireUnconfirmedCash(cutoff)).length,
    };
  },

  /**
   * Warn owners whose vouchers lapse soon. Two milestones so a customer gets a
   * useful heads-up AND a last call; each is deduped per voucher.
   */
  'voucher-expiry-reminder': async () => {
    const [week, tomorrow] = await Promise.all([
      voucherService.remindExpiring(7),
      voucherService.remindExpiring(1),
    ]);
    return { sevenDays: week, oneDay: tomorrow };
  },

  /** Warn about the upcoming annual reset while there is still time to act. */
  'loyalty-reset-warning': async () => ({
    notified: await loyaltyService.notifyUpcomingReset(30),
  }),

  /** Yearly points/tier reset. Guarded against running twice in one year. */
  'loyalty-annual-reset': () => loyaltyService.annualReset(),
};

/** Constant-time compare so a wrong secret leaks nothing through timing. */
function secretMatches(provided: string): boolean {
  const expected = config.cron.secret;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cronAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!config.cron.secret) {
    // No secret configured → the endpoint does not exist, rather than existing
    // unprotected.
    return next(new HttpException(404, 'Not Found'));
  }
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const provided =
    (req.headers['x-cron-secret'] as string | undefined) ?? bearer;
  if (!secretMatches(provided)) {
    return next(new HttpException(401, 'Unauthorized'));
  }
  next();
}

const runJob = asyncHandler(
  async (req: Request<{ name: string }>, res: Response) => {
    const runner = JOBS[req.params.name];
    if (!runner) {
      throw new HttpException(404, `Unknown job "${req.params.name}"`);
    }
    const startedAt = Date.now();
    const result = await runner();
    const durationMs = Date.now() - startedAt;
    console.log(
      `job.completed name=${req.params.name} durationMs=${durationMs} ` +
        `result=${JSON.stringify(result)}`,
    );
    res.json({ job: req.params.name, durationMs, result });
  },
);

export const jobsRouter = Router();
jobsRouter.use(cronAuth);

// Vercel Cron issues a GET (with `Authorization: Bearer $CRON_SECRET`), while a
// human triggering a job by hand reaches for POST. Both are accepted; every job
// is idempotent, so the non-idempotent-GET objection does not apply here.
jobsRouter.get('/:name', runJob);
jobsRouter.post('/:name', runJob);
