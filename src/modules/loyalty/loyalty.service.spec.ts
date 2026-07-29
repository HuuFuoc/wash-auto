/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
jest.mock('../notification/notification.router', () => ({
  notificationService: {
    notifyUser: jest.fn(async () => undefined),
    notifyUserOnce: jest.fn(async () => true),
  },
}));

import { Types } from 'mongoose';
import {
  LoyaltyService,
  estimateReward,
  rewardCapFor,
} from './loyalty.service';
import { LoyaltyTransactionTypeEnum } from '../../shared/loyalty/types/loyalty-transaction-type.enum';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';
import { notificationService } from '../notification/notification.router';

/* eslint-disable @typescript-eslint/unbound-method -- jest.fn mocks have no `this` to lose */
const notifyOnce = notificationService.notifyUserOnce as jest.Mock;
const notifyUser = notificationService.notifyUser as jest.Mock;
/* eslint-enable @typescript-eslint/unbound-method */

const customerId = new Types.ObjectId();
const orderId = new Types.ObjectId();

function tierDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tier_name: TierNameEnum.NONE,
    min_loyalty_points: 0,
    priority_level: 0,
    points_per_1000_vnd: 1,
    discount_percent: 2,
    washes_per_reward_voucher: 10,
    voucher_reward_rate_percent: 5,
    voucher_reward_multiplier: 1,
    voucher_reward_floor_vnd: 20_000,
    voucher_reward_ceil_vnd: 100_000,
    minimum_valid_wash_vnd: 40_000,
    voucher_expiry_days: 90,
    ...over,
  };
}

function accountDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    customer_id: customerId,
    // tier_config_id is filled in by makeService to point at the harness tier.
    // Tests that want a dangling or mismatched reference pass it explicitly.
    points_balance: 0,
    successful_washes_toward_voucher: 0,
    spend_toward_voucher: 0,
    total_successful_washes: 0,
    lifetime_points: 0,
    lifetime_spend_vnd: 0,
    lifetime_saved_vnd: 0,
    ...over,
  };
}

function makeService(overrides: {
  account?: Record<string, unknown>;
  tier?: Record<string, unknown>;
  loyaltyRepository?: Record<string, unknown>;
  tierConfigRepository?: Record<string, unknown>;
  voucherService?: Record<string, unknown>;
  transactionRepository?: Record<string, unknown>;
}) {
  const account = overrides.account ?? accountDoc();
  const tier = overrides.tier ?? tierDoc();
  // A real account points AT its tier. Left unset, ensureForCustomer would read
  // the mismatch as corruption and repair it before the test's own assertions.
  const acct = account as Record<string, unknown>;
  if (acct.tier_config_id === undefined) acct.tier_config_id = tier._id;
  const loyaltyRepository = {
    findByCustomerId: jest.fn(async () => account),
    updateById: jest.fn(
      async (_id: Types.ObjectId, _input: Record<string, unknown>) => account,
    ),
    findAll: jest.fn(async () => [account]),
    ...overrides.loyaltyRepository,
  };
  const tierConfigRepository = {
    findById: jest.fn(async () => tier),
    findByName: jest.fn(async () => tier),
    findActive: jest.fn(async () => [tier]),
    ...overrides.tierConfigRepository,
  };
  const transactionRepository = {
    create: jest.fn(async (_input: Record<string, unknown>) => ({})),
    ...overrides.transactionRepository,
  };
  const voucherService = {
    grantFreeWash: jest.fn(async (_input: Record<string, unknown>) => ({
      _id: new Types.ObjectId(),
    })),
    ...overrides.voucherService,
  };
  const service = new LoyaltyService(
    loyaltyRepository as never,
    transactionRepository as never,
    tierConfigRepository as never,
    voucherService as never,
  );
  return { service, loyaltyRepository, transactionRepository, voucherService };
}

describe('reward economics come from tier config, not constants', () => {
  it('mints the voucher at the tier threshold, not a hardcoded 10', async () => {
    // Gold reaches its milestone at 8 washes.
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 7 }),
      tier: tierDoc({ washes_per_reward_voucher: 8 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    expect(h.voucherService.grantFreeWash).toHaveBeenCalledTimes(1);
  });

  it('does not mint below the tier threshold', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 6 }),
      tier: tierDoc({ washes_per_reward_voucher: 10 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    expect(h.voucherService.grantFreeWash).not.toHaveBeenCalled();
  });

  it('gives a higher tier a bigger reward for identical spend', async () => {
    const spend = 1_000_000;
    const base = rewardCapFor(
      tierDoc({ voucher_reward_multiplier: 1 }) as never,
      spend,
    );
    const gold = rewardCapFor(
      tierDoc({
        voucher_reward_multiplier: 1.5,
        voucher_reward_ceil_vnd: 150_000,
      }) as never,
      spend,
    );
    expect(gold).toBeGreaterThan(base);
  });

  it('clamps the reward between the tier floor and ceiling', async () => {
    const tiny = rewardCapFor(tierDoc() as never, 1_000);
    const huge = rewardCapFor(tierDoc() as never, 999_999_999);
    expect(tiny).toBe(20_000); // floor
    expect(huge).toBe(100_000); // ceiling
  });

  it('honours the tier minimum-wash rule when counting progress', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 9 }),
      tier: tierDoc({ minimum_valid_wash_vnd: 80_000 }),
    });
    // 50k is below this tier's 80k minimum → the wash does not count.
    await h.service.applyOrderCompleted(customerId, orderId, 50_000, true);

    expect(h.voucherService.grantFreeWash).not.toHaveBeenCalled();
    const written = h.loyaltyRepository.updateById.mock.calls[0][1] as Record<
      string,
      number
    >;
    expect(written.successfulWashesTowardVoucher).toBe(9);
  });

  it('expires the reward voucher on the tier schedule', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 9 }),
      tier: tierDoc({ voucher_expiry_days: 180 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    const granted = h.voucherService.grantFreeWash.mock.calls[0][0] as {
      expiresAt: Date;
    };
    const days = Math.round(
      (granted.expiresAt.getTime() - Date.now()) / 86_400_000,
    );
    expect(days).toBe(180);
  });

  it('carries the surplus over when a lowered threshold is already passed', async () => {
    // Operator drops the milestone 10 → 8 while a customer sits at 9.
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 9 }),
      tier: tierDoc({ washes_per_reward_voucher: 8 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    const written = h.loyaltyRepository.updateById.mock.calls[0][1] as Record<
      string,
      number
    >;
    // 9 + 1 = 10, minus the 8 threshold → 2 carried forward, nothing lost.
    expect(written.successfulWashesTowardVoucher).toBe(2);
  });
});

describe('lifetime counters', () => {
  it('accumulates lifetime points, spend and savings', async () => {
    const h = makeService({
      account: accountDoc({
        lifetime_points: 100,
        lifetime_spend_vnd: 500_000,
        lifetime_saved_vnd: 40_000,
      }),
    });
    await h.service.applyOrderCompleted(
      customerId,
      orderId,
      200_000,
      true,
      15_000,
    );

    const written = h.loyaltyRepository.updateById.mock.calls[0][1] as Record<
      string,
      number
    >;
    expect(written.lifetimePoints).toBe(300); // 100 + 200k/1000 * 1
    expect(written.lifetimeSpendVnd).toBe(700_000);
    expect(written.lifetimeSavedVnd).toBe(55_000);
  });
});

describe('LoyaltyService.annualReset', () => {
  it('keeps voucher progress — it is not a calendar-year concept', async () => {
    // Regression: a customer at 9/10 washes on 31 December used to wake up at 0.
    const account = accountDoc({
      points_balance: 900,
      successful_washes_toward_voucher: 9,
      spend_toward_voucher: 800_000,
    });
    const h = makeService({
      account,
      loyaltyRepository: {
        findDueForAnnualReset: jest.fn(async () => [account]),
        claimForAnnualReset: jest.fn(async () => true),
        updateById: jest.fn(
          async (_id: Types.ObjectId, _input: Record<string, unknown>) =>
            account,
        ),
      },
    });

    await h.service.annualReset();

    const written = h.loyaltyRepository.updateById.mock.calls[0][1];
    expect(written.pointsBalance).toBe(0);
    expect(written.successfulWashesTowardVoucher).toBeUndefined();
    expect(written.spendTowardVoucher).toBeUndefined();
  });

  it('does not reset the same account twice in one year', async () => {
    const account = accountDoc({ points_balance: 500 });
    const h = makeService({
      account,
      loyaltyRepository: {
        findDueForAnnualReset: jest.fn(async () => [account]),
        // The compare-and-set lost: a peer already claimed this account.
        claimForAnnualReset: jest.fn(async () => false),
        updateById: jest.fn(
          async (_id: Types.ObjectId, _input: Record<string, unknown>) =>
            account,
        ),
      },
    });

    const result = await h.service.annualReset();

    expect(result.resetCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(h.loyaltyRepository.updateById).not.toHaveBeenCalled();
  });

  it('logs an ANNUAL_RESET transaction for the audit trail', async () => {
    const account = accountDoc({ points_balance: 900 });
    const h = makeService({
      account,
      loyaltyRepository: {
        findDueForAnnualReset: jest.fn(async () => [account]),
        claimForAnnualReset: jest.fn(async () => true),
        updateById: jest.fn(
          async (_id: Types.ObjectId, _input: Record<string, unknown>) =>
            account,
        ),
      },
    });

    await h.service.annualReset();

    const logged = h.transactionRepository.create.mock.calls[0][0] as {
      type: string;
      pointsDelta: number;
    };
    expect(logged.type).toBe(LoyaltyTransactionTypeEnum.ANNUAL_RESET);
    expect(logged.pointsDelta).toBe(-900);
  });

  it('keeps going when one account fails', async () => {
    const good = accountDoc();
    const bad = accountDoc({ _id: new Types.ObjectId() });
    const h = makeService({
      loyaltyRepository: {
        findDueForAnnualReset: jest.fn(async () => [bad, good]),
        claimForAnnualReset: jest.fn(async () => true),
        updateById: jest
          .fn()
          .mockRejectedValueOnce(new Error('db blip'))
          .mockResolvedValueOnce(good),
      },
    });

    const result = await h.service.annualReset();
    expect(result.resetCount).toBe(1);
  });
});

describe('notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('celebrates a voucher milestone', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 9 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    const calls = notifyOnce.mock.calls;
    expect(
      calls.some(
        ([, , input]) => (input as { type: string }).type === 'voucher_granted',
      ),
    ).toBe(true);
  });

  it('nudges a customer who is close to the milestone', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 7 }),
      tier: tierDoc({ washes_per_reward_voucher: 10 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    const calls = notifyOnce.mock.calls;
    expect(
      calls.some(
        ([, , input]) =>
          (input as { type: string }).type === 'voucher_milestone_near',
      ),
    ).toBe(true);
  });

  it('stays quiet when the milestone is still far away', async () => {
    const h = makeService({
      account: accountDoc({ successful_washes_toward_voucher: 2 }),
      tier: tierDoc({ washes_per_reward_voucher: 10 }),
    });
    await h.service.applyOrderCompleted(customerId, orderId, 100_000, true);

    expect(notifyOnce).not.toHaveBeenCalled();
  });

  it('routes every loyalty notification through the deduped path', async () => {
    // notifyUserOnce carries the idempotency guard; notifyUser does not. A
    // scheduled job that re-runs must not produce a second copy.
    const account = accountDoc({ points_balance: 500 });
    const h = makeService({
      account,
      loyaltyRepository: {
        findDueForAnnualReset: jest.fn(async () => [account]),
        claimForAnnualReset: jest.fn(async () => true),
        updateById: jest.fn(
          async (_id: Types.ObjectId, _input: Record<string, unknown>) =>
            account,
        ),
      },
    });

    await h.service.annualReset();

    expect(notifyOnce).toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe('estimateReward', () => {
  it('projects the current spend rate across the full milestone', async () => {
    // 100k over 2 washes → 500k projected over 10, 5% of that = 25k.
    const estimate = estimateReward(tierDoc() as never, 100_000, 2);
    expect(estimate).toBe(25_000);
  });

  it('falls back to the floor before any progress exists', async () => {
    expect(estimateReward(tierDoc() as never, 0, 0)).toBe(20_000);
  });
});

describe('ensureForCustomer repairs a dangling tier without demoting', () => {
  // Every reseed of tier_configs minted fresh _ids, so accounts promoted under
  // an older generation ended up pointing at a tier row that no longer exists.
  // The self-heal must put them back on the tier their balance earns them, not
  // reset the ladder to None.
  const noneTier = tierDoc({
    tier_name: TierNameEnum.NONE,
    min_loyalty_points: 0,
  });
  const bronzeTier = tierDoc({
    tier_name: TierNameEnum.BRONZE,
    min_loyalty_points: 200,
  });
  const silverTier = tierDoc({
    tier_name: TierNameEnum.SILVER,
    min_loyalty_points: 500,
  });
  const ladder = [noneTier, bronzeTier, silverTier];

  function danglingHarness(pointsBalance: number) {
    const account = accountDoc({
      tier_config_id: new Types.ObjectId(), // points at a wiped generation
      points_balance: pointsBalance,
    });
    return makeService({
      account,
      tierConfigRepository: {
        findById: jest.fn(async () => null), // the dangling ref resolves to nothing
        findByName: jest.fn(async () => noneTier),
        findActive: jest.fn(async () => ladder),
      },
    });
  }

  it('snaps a 643-point account back to Silver, not None', async () => {
    const h = danglingHarness(643);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).toHaveBeenCalledWith(
      expect.anything(),
      { tierConfigId: silverTier._id },
    );
  });

  it('snaps a 454-point account back to Bronze', async () => {
    const h = danglingHarness(454);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).toHaveBeenCalledWith(
      expect.anything(),
      { tierConfigId: bronzeTier._id },
    );
  });

  it('still lands a 0-point account on None', async () => {
    const h = danglingHarness(0);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).toHaveBeenCalledWith(
      expect.anything(),
      { tierConfigId: noneTier._id },
    );
  });
});

describe('ensureForCustomer corrects a tier that disagrees with the balance', () => {
  // The dangling-reference repair above only fires when the linked tier is
  // GONE. Accounts that the previous code already snapped down to a real None
  // row look perfectly consistent — a live tier_config_id — so nothing ever
  // reconsidered them, and a 438-point customer stayed None indefinitely.
  const noneTier = tierDoc({
    tier_name: TierNameEnum.NONE,
    min_loyalty_points: 0,
  });
  const bronzeTier = tierDoc({
    tier_name: TierNameEnum.BRONZE,
    min_loyalty_points: 200,
  });
  const silverTier = tierDoc({
    tier_name: TierNameEnum.SILVER,
    min_loyalty_points: 500,
  });
  const ladder = [noneTier, bronzeTier, silverTier];

  function harness(pointsBalance: number, linked: Record<string, unknown>) {
    const account = accountDoc({
      tier_config_id: linked._id as Types.ObjectId,
      points_balance: pointsBalance,
    });
    return makeService({
      account,
      tierConfigRepository: {
        findById: jest.fn(async () => linked),
        findByName: jest.fn(async () => noneTier),
        findActive: jest.fn(async () => ladder),
      },
    });
  }

  it('promotes a 438-point account stuck on None to Bronze', async () => {
    const h = harness(438, noneTier);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).toHaveBeenCalledWith(
      expect.anything(),
      { tierConfigId: bronzeTier._id },
    );
  });

  it('leaves an account already on the right tier untouched', async () => {
    const h = harness(438, bronzeTier);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).not.toHaveBeenCalled();
  });

  it('does not touch a 0-point account sitting on None', async () => {
    const h = harness(0, noneTier);

    await h.service.ensureForCustomer(customerId);

    expect(h.loyaltyRepository.updateById).not.toHaveBeenCalled();
  });
});
