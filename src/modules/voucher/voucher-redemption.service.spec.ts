/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
jest.mock('../../common/with-transaction', () => ({
  // Transactions need a replica set; the unit suite runs against no database at
  // all. Executing the callback directly exercises the same ordering of writes.
  withTransaction: (fn: (session?: unknown) => Promise<unknown>) =>
    fn(undefined),
}));

import { Types } from 'mongoose';
import { VoucherService } from './voucher.service';
import { ConflictException } from '../../common/exceptions';
import { RedemptionStatusEnum } from '../../shared/voucher/types/redemption-status.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';

const customerId = new Types.ObjectId();
const orderId = new Types.ObjectId();
const campaignId = new Types.ObjectId();

const BREAKDOWN = {
  subtotalVnd: 200_000,
  eligibleAmountVnd: 200_000,
  promotionDiscountVnd: 20_000,
  tierDiscountVnd: 16_000,
  voucherDiscountVnd: 50_000,
  totalDiscountVnd: 86_000,
  finalTotalVnd: 114_000,
  voucherAccepted: true,
};

function voucherDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    campaign_id: campaignId,
    customer_id: customerId,
    code: 'WASH-4KP9XM2A7B',
    type: 'free_wash',
    status: VoucherStatusEnum.RESERVED,
    discount_cap_vnd: 50_000,
    expires_at: new Date(Date.now() + 86_400_000),
    created_at: new Date(),
    ...over,
  };
}

function makeService(
  repository: Record<string, unknown>,
  redemptionRepository: Record<string, unknown>,
  campaignRepository: Record<string, unknown> = {
    incrementRedeemed: jest.fn(async () => undefined),
  },
) {
  return new VoucherService(
    repository as never,
    {} as never,
    {} as never,
    campaignRepository as never,
    redemptionRepository as never,
    {} as never,
  );
}

describe('VoucherService.reserveForOrder', () => {
  const input = {
    voucherId: new Types.ObjectId().toString(),
    customerId: customerId.toString(),
    orderId,
    reservedUntil: new Date(Date.now() + 16 * 60_000),
    breakdown: BREAKDOWN as never,
  };

  it('holds the voucher and freezes the breakdown on the redemption', async () => {
    const repository = { reserve: jest.fn(async () => voucherDoc()) };
    const redemptionRepository = {
      createReserved: jest.fn(async (i: Record<string, unknown>) => i),
    };
    await makeService(repository, redemptionRepository).reserveForOrder(input);

    const written = redemptionRepository.createReserved.mock.calls[0][0] as {
      voucherDiscountVnd: number;
      finalOrderVnd: number;
      originalOrderVnd: number;
      orderId: Types.ObjectId;
    };
    expect(written.voucherDiscountVnd).toBe(50_000);
    expect(written.finalOrderVnd).toBe(114_000);
    expect(written.originalOrderVnd).toBe(200_000);
    expect(written.orderId).toEqual(orderId);
  });

  it('does NOT mark the voucher used — payment has not happened yet', async () => {
    const repository = {
      reserve: jest.fn(async () => voucherDoc()),
      consume: jest.fn(),
      redeemReserved: jest.fn(),
    };
    const redemptionRepository = { createReserved: jest.fn(async () => ({})) };
    await makeService(repository, redemptionRepository).reserveForOrder(input);

    expect(repository.consume).not.toHaveBeenCalled();
    expect(repository.redeemReserved).not.toHaveBeenCalled();
  });

  it('fails when a concurrent order already took the voucher', async () => {
    // The CAS matched nothing → someone else won the race.
    const repository = { reserve: jest.fn(async () => null) };
    const redemptionRepository = { createReserved: jest.fn() };

    await expect(
      makeService(repository, redemptionRepository).reserveForOrder(input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(redemptionRepository.createReserved).not.toHaveBeenCalled();
  });

  it('fails when the unique index rejects a second live redemption', async () => {
    const repository = { reserve: jest.fn(async () => voucherDoc()) };
    const redemptionRepository = {
      createReserved: jest.fn(async () => {
        throw new Error('E11000 duplicate key error: active_voucher_id');
      }),
    };

    await expect(
      makeService(repository, redemptionRepository).reserveForOrder(input),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('VoucherService.redeemForOrder', () => {
  it('spends the voucher and charges the discount to the campaign budget', async () => {
    const repository = { redeemReserved: jest.fn(async () => voucherDoc()) };
    const redemptionRepository = {
      markApplied: jest.fn(async () => ({
        campaign_id: campaignId,
        voucher_discount_vnd: 50_000,
      })),
    };
    const campaignRepository = {
      incrementRedeemed: jest.fn(async () => undefined),
    };

    const done = await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).redeemForOrder(orderId);

    expect(done).toBe(true);
    expect(campaignRepository.incrementRedeemed).toHaveBeenCalledWith(
      campaignId,
      1,
      50_000,
      undefined,
    );
  });

  it('is idempotent: a replayed webhook does not double-charge the budget', async () => {
    // Nothing left in RESERVED — the first webhook already settled it.
    const repository = { redeemReserved: jest.fn(async () => null) };
    const redemptionRepository = { markApplied: jest.fn() };
    const campaignRepository = { incrementRedeemed: jest.fn() };

    const done = await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).redeemForOrder(orderId);

    expect(done).toBe(false);
    expect(redemptionRepository.markApplied).not.toHaveBeenCalled();
    expect(campaignRepository.incrementRedeemed).not.toHaveBeenCalled();
  });

  it('skips the budget update for a voucher with no campaign', async () => {
    const repository = { redeemReserved: jest.fn(async () => voucherDoc()) };
    const redemptionRepository = {
      markApplied: jest.fn(async () => ({
        campaign_id: undefined,
        voucher_discount_vnd: 30_000,
      })),
    };
    const campaignRepository = { incrementRedeemed: jest.fn() };

    await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).redeemForOrder(orderId);

    expect(campaignRepository.incrementRedeemed).not.toHaveBeenCalled();
  });
});

describe('VoucherService.releaseForOrder', () => {
  it('returns an unsettled hold without touching the budget', async () => {
    const redemptionRepository = {
      closeAnyActive: jest.fn(async () => ({
        status: RedemptionStatusEnum.RELEASED,
        campaign_id: campaignId,
        voucher_discount_vnd: 50_000,
        voucher_id: new Types.ObjectId(),
      })),
    };
    const repository = {
      releaseReservation: jest.fn(async () => voucherDoc()),
      refund: jest.fn(),
    };
    const campaignRepository = { incrementRedeemed: jest.fn() };

    const released = await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).releaseForOrder(orderId);

    expect(released).toBe(true);
    // Never settled → nothing was ever charged, so nothing to refund.
    expect(campaignRepository.incrementRedeemed).not.toHaveBeenCalled();
    expect(repository.refund).not.toHaveBeenCalled();
  });

  it('backs the budget out when an already-settled redemption is undone', async () => {
    const voucherId = new Types.ObjectId();
    const redemptionRepository = {
      closeAnyActive: jest.fn(async () => ({
        status: RedemptionStatusEnum.CANCELLED,
        campaign_id: campaignId,
        voucher_discount_vnd: 50_000,
        voucher_id: voucherId,
      })),
    };
    const repository = {
      // Nothing in RESERVED: it had already been redeemed.
      releaseReservation: jest.fn(async () => null),
      refund: jest.fn(async () => voucherDoc()),
    };
    const campaignRepository = {
      incrementRedeemed: jest.fn(async () => undefined),
    };

    await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).releaseForOrder(orderId);

    expect(repository.refund).toHaveBeenCalledWith(voucherId);
    // A cancelled order must not permanently consume campaign budget.
    expect(campaignRepository.incrementRedeemed).toHaveBeenCalledWith(
      campaignId,
      -1,
      -50_000,
      undefined,
    );
  });

  it('is a no-op for an order that never held a voucher', async () => {
    const redemptionRepository = { closeAnyActive: jest.fn(async () => null) };
    const repository = {
      releaseReservation: jest.fn(async () => null),
      refund: jest.fn(),
    };
    const campaignRepository = { incrementRedeemed: jest.fn() };

    const released = await makeService(
      repository,
      redemptionRepository,
      campaignRepository,
    ).releaseForOrder(orderId);

    expect(released).toBe(false);
    expect(repository.refund).not.toHaveBeenCalled();
    expect(campaignRepository.incrementRedeemed).not.toHaveBeenCalled();
  });
});

describe('VoucherService.sweepExpiredReservations', () => {
  it('releases only reservations whose hold has actually lapsed', async () => {
    const dueOrder = new Types.ObjectId();
    const redemptionRepository = {
      findExpiredReservations: jest.fn(async () => [{ order_id: dueOrder }]),
      closeAnyActive: jest.fn(async () => ({
        status: RedemptionStatusEnum.RELEASED,
        voucher_id: new Types.ObjectId(),
      })),
    };
    const repository = {
      releaseReservation: jest.fn(async () => voucherDoc()),
      refund: jest.fn(),
    };

    const released = await makeService(
      repository,
      redemptionRepository,
    ).sweepExpiredReservations();

    expect(released).toBe(1);
    // Swept against "now", so a hold that has not lapsed yet is never picked up.
    expect(redemptionRepository.findExpiredReservations).toHaveBeenCalledWith(
      expect.any(Date),
    );
  });

  it('keeps going when one release fails', async () => {
    const redemptionRepository = {
      findExpiredReservations: jest.fn(async () => [
        { order_id: new Types.ObjectId() },
        { order_id: new Types.ObjectId() },
      ]),
      closeAnyActive: jest
        .fn()
        .mockRejectedValueOnce(new Error('db blip'))
        .mockResolvedValueOnce({
          status: RedemptionStatusEnum.RELEASED,
          voucher_id: new Types.ObjectId(),
        }),
    };
    const repository = {
      releaseReservation: jest.fn(async () => voucherDoc()),
      refund: jest.fn(),
    };

    const released = await makeService(
      repository,
      redemptionRepository,
    ).sweepExpiredReservations();

    expect(released).toBe(1);
  });

  it('reports nothing released when there is nothing due', async () => {
    const redemptionRepository = {
      findExpiredReservations: jest.fn(async () => []),
    };
    const released = await makeService(
      {},
      redemptionRepository,
    ).sweepExpiredReservations();

    expect(released).toBe(0);
  });
});
