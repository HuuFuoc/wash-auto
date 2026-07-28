/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async service signatures */
const CRON_SECRET = 'test-cron-secret-value';

jest.mock('../../config', () => ({
  config: {
    cron: { secret: CRON_SECRET },
    booking: { paymentTimeoutMinutes: 15, cashArrivalGraceMinutes: 30 },
  },
}));
jest.mock('../voucher/voucher.router', () => ({
  voucherService: {
    expireDue: jest.fn(async () => 7),
    sweepExpiredReservations: jest.fn(async () => 3),
  },
}));
jest.mock('../voucher-campaign/voucher-campaign.router', () => ({
  voucherCampaignService: {
    sweepLifecycle: jest.fn(async () => ({ started: 1, ended: 2 })),
    reconcileAllCounters: jest.fn(async () => ({ checked: 5, repaired: 0 })),
  },
}));
jest.mock('../order/order.router', () => ({
  orderService: {
    expirePendingPayment: jest.fn(async () => ['o1', 'o2']),
    expireUnconfirmedCash: jest.fn(async () => ['o3']),
  },
}));
jest.mock('../loyalty/loyalty.router', () => ({
  loyaltyService: { annualReset: jest.fn(async () => ({ resetCount: 12 })) },
}));

import express from 'express';
import request from 'supertest';
import { jobsRouter } from './jobs.router';
import { errorMiddleware } from '../../middlewares/error.middleware';
import { voucherService } from '../voucher/voucher.router';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/internal/jobs', jobsRouter);
  app.use(errorMiddleware);
  return app;
}

/**
 * Grabbed once for the assertions below. `unbound-method` is about losing `this`
 * on a real method; this is a jest.fn from the module mock above, which has no
 * `this` to lose.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
const expireDue = voucherService.expireDue as jest.Mock;

describe('jobs router — authorisation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a request with no credentials', async () => {
    await request(makeApp()).post('/internal/jobs/voucher-expiry').expect(401);
    expect(expireDue).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    await request(makeApp())
      .post('/internal/jobs/voucher-expiry')
      .set('X-Cron-Secret', 'not-the-secret-at-all')
      .expect(401);
    expect(expireDue).not.toHaveBeenCalled();
  });

  it('rejects a secret that only shares a prefix', async () => {
    await request(makeApp())
      .post('/internal/jobs/voucher-expiry')
      .set('X-Cron-Secret', CRON_SECRET.slice(0, 10))
      .expect(401);
  });

  it('accepts the Bearer form Vercel Cron sends', async () => {
    await request(makeApp())
      .get('/internal/jobs/voucher-expiry')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(200);
    expect(expireDue).toHaveBeenCalledTimes(1);
  });

  it('accepts the X-Cron-Secret header form', async () => {
    await request(makeApp())
      .post('/internal/jobs/voucher-expiry')
      .set('X-Cron-Secret', CRON_SECRET)
      .expect(200);
    expect(expireDue).toHaveBeenCalledTimes(1);
  });

  it('does not accept a user bearer token as a cron credential', async () => {
    await request(makeApp())
      .post('/internal/jobs/voucher-expiry')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.token')
      .expect(401);
  });
});

describe('jobs router — dispatch', () => {
  beforeEach(() => jest.clearAllMocks());

  const call = (name: string) =>
    request(makeApp())
      .post(`/internal/jobs/${name}`)
      .set('X-Cron-Secret', CRON_SECRET);

  it('404s an unknown job name rather than failing silently', async () => {
    await call('drop-everything').expect(404);
  });

  it('runs the reservation sweep and reports what it freed', async () => {
    const res = await call('voucher-reservation-sweep').expect(200);
    expect(res.body).toMatchObject({
      job: 'voucher-reservation-sweep',
      result: 3,
    });
  });

  it.each([
    'voucher-expiry',
    'voucher-reservation-sweep',
    'campaign-lifecycle',
    'campaign-reconcile',
    'order-expiry',
    'cash-no-show',
    'loyalty-annual-reset',
  ])('exposes %s, so every scheduled job is reachable', async (name) => {
    await call(name).expect(200);
  });

  it('reports how long the job took', async () => {
    const res = await call('voucher-expiry').expect(200);
    expect(typeof (res.body as { durationMs: number }).durationMs).toBe(
      'number',
    );
  });
});
