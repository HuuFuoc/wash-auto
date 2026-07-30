/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async service signatures */

/**
 * Router-level contract for the public campaign endpoints, exercised through a
 * real Express stack rather than by calling the controller directly. That is
 * the only way to prove the two things this file exists for:
 *
 *  1. The reads take OPTIONAL auth and the claim takes REQUIRED auth. Getting
 *     that backwards on either would be invisible in a service unit test — one
 *     way logs out the promotions page, the other hands vouchers to anonymous
 *     callers.
 *  2. `voucherService` is actually resolved when this module is evaluated. It
 *     is imported from voucher.router, so a future import back the other way
 *     would silently leave it `undefined` at module scope and every claim would
 *     500 in production while the unit tests stayed green. voucher.router is
 *     therefore deliberately NOT mocked here — the real singleton is imported
 *     and spied on, so a cycle makes `jest.spyOn` throw instead of hiding.
 */
const mockCampaignService = {
  listPublic: jest.fn(async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  })),
  getPublicById: jest.fn(async () => ({ id: 'campaign-1' })),
};

jest.mock('./voucher-campaign.service', () => ({
  VoucherCampaignService: jest.fn(() => mockCampaignService),
}));
// The real limiter opens a Redis connection at import time; the account-keyed
// throttling itself is covered where the limiter is defined.
jest.mock('../../middlewares/rate-limit.middleware', () => ({
  voucherClaimRateLimiter: (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ): void => next(),
}));

import 'reflect-metadata';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../../config';
import { errorMiddleware } from '../../middlewares/error.middleware';
// Imported BEFORE voucher.router so the module graph is loaded in the direction
// that a cycle would break: voucher-campaign first, reaching back for voucher.
import { voucherCampaignRouter } from './voucher-campaign.router';
import { voucherService } from '../voucher/voucher.router';

const CAMPAIGN_ID = '6601e3b3f1a2c3a4b5d6e7f8';
const CUSTOMER_ID = '6601e3b3f1a2c3a4b5d6e7f9';

// Throws outright if the import direction ever regresses into a cycle, because
// `voucherService` would be undefined at the moment the router captured it.
const claimFromCampaignId = jest
  .spyOn(voucherService, 'claimFromCampaignId')
  .mockResolvedValue({ id: 'voucher-1' } as never);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/voucher-campaigns', voucherCampaignRouter);
  app.use(errorMiddleware);
  return app;
}

const bearer = (sub = CUSTOMER_ID) =>
  `Bearer ${jwt.sign({ sub, role: 'customer' }, config.auth.accessSecret)}`;

beforeEach(() => {
  jest.clearAllMocks();
  claimFromCampaignId.mockResolvedValue({ id: 'voucher-1' } as never);
});

describe('public campaign reads — optional auth', () => {
  it('serves the list to an anonymous visitor, with no viewer', async () => {
    await request(makeApp()).get('/voucher-campaigns').expect(200);

    expect(mockCampaignService.listPublic).toHaveBeenCalledWith(
      undefined,
      1,
      20,
      undefined,
    );
  });

  it('passes the signed-in customer through so cards can say "Đã nhận"', async () => {
    await request(makeApp())
      .get('/voucher-campaigns')
      .set('Authorization', bearer())
      .expect(200);

    expect(mockCampaignService.listPublic).toHaveBeenCalledWith(
      undefined,
      1,
      20,
      CUSTOMER_ID,
    );
  });

  it('degrades a junk token to anonymous instead of 401-ing a public page', async () => {
    await request(makeApp())
      .get(`/voucher-campaigns/${CAMPAIGN_ID}`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(200);

    expect(mockCampaignService.getPublicById).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      undefined,
    );
  });

  it('reads the detail with the viewer when a good token is sent', async () => {
    await request(makeApp())
      .get(`/voucher-campaigns/${CAMPAIGN_ID}`)
      .set('Authorization', bearer())
      .expect(200);

    expect(mockCampaignService.getPublicById).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      CUSTOMER_ID,
    );
  });
});

describe('campaign claim — required auth', () => {
  it('401s an anonymous claim without touching the pool', async () => {
    await request(makeApp())
      .post(`/voucher-campaigns/${CAMPAIGN_ID}/claim`)
      .expect(401);

    expect(claimFromCampaignId).not.toHaveBeenCalled();
  });

  it('401s an invalid token — optional auth must not leak onto this route', async () => {
    await request(makeApp())
      .post(`/voucher-campaigns/${CAMPAIGN_ID}/claim`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);

    expect(claimFromCampaignId).not.toHaveBeenCalled();
  });

  it('claims for the token holder and answers 201, like /me/vouchers/claim', async () => {
    const res = await request(makeApp())
      .post(`/voucher-campaigns/${CAMPAIGN_ID}/claim`)
      .set('Authorization', bearer())
      .expect(201);

    // The customer comes from the token, never from the request body — a
    // crafted payload cannot claim into someone else's wallet.
    expect(claimFromCampaignId).toHaveBeenCalledWith(CUSTOMER_ID, CAMPAIGN_ID);
    expect(res.body).toEqual({ id: 'voucher-1' });
  });

  it('ignores a body claiming to be a different customer', async () => {
    await request(makeApp())
      .post(`/voucher-campaigns/${CAMPAIGN_ID}/claim`)
      .set('Authorization', bearer())
      .send({ customerId: 'someone-else', campaignId: 'another-campaign' })
      .expect(201);

    expect(claimFromCampaignId).toHaveBeenCalledWith(CUSTOMER_ID, CAMPAIGN_ID);
  });
});
