/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
import { Types } from 'mongoose';
import { TierConfigService } from './tier-config.service';
import { BadRequestException } from '../../common/exceptions';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';

function tierDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tier_name: TierNameEnum.GOLD,
    min_loyalty_points: 1500,
    booking_window_days: 14,
    priority_level: 3,
    points_per_1000_vnd: 3,
    discount_percent: 10,
    is_active: true,
    washes_per_reward_voucher: 8,
    voucher_reward_rate_percent: 5,
    voucher_reward_multiplier: 1.5,
    voucher_reward_floor_vnd: 30_000,
    voucher_reward_ceil_vnd: 150_000,
    minimum_valid_wash_vnd: 40_000,
    voucher_expiry_days: 180,
    birthday_voucher_vnd: 100_000,
    exclusive_campaign_access: true,
    ...over,
  };
}

describe('TierConfigService.seedDefaults', () => {
  it('does NOT wipe tiers an operator has customised', async () => {
    // Regression: seeding used to compare every stored value against the
    // hardcoded defaults and drop the whole collection on any difference, so a
    // discount edited through the admin API survived only until the next
    // restart.
    const customised = tierDoc({
      discount_percent: 25,
      min_loyalty_points: 999,
    });
    const repository = {
      deleteByNamesNotIn: jest.fn(async () => 0),
      findAll: jest.fn(async () => [customised]),
      update: jest.fn(),
      upsertByName: jest.fn(async () => customised),
      deleteAll: jest.fn(),
    };

    await new TierConfigService(repository as never).seedDefaults();

    expect(repository.deleteAll).not.toHaveBeenCalled();
    // upsertByName writes with $setOnInsert, so the existing row is untouched.
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('drops tiers from the previous model so their priority levels free up', async () => {
    const repository = {
      deleteByNamesNotIn: jest.fn(async () => 2),
      findAll: jest.fn(async () => []),
      update: jest.fn(),
      upsertByName: jest.fn(async () => tierDoc()),
      deleteAll: jest.fn(),
    };

    await new TierConfigService(repository as never).seedDefaults();

    expect(repository.deleteByNamesNotIn).toHaveBeenCalledWith([
      TierNameEnum.NONE,
      TierNameEnum.BRONZE,
      TierNameEnum.SILVER,
      TierNameEnum.GOLD,
    ]);
    expect(repository.deleteAll).not.toHaveBeenCalled();
  });

  it('repairs only the field a pre-schema row is actually missing', async () => {
    const legacy = tierDoc({
      tier_name: TierNameEnum.SILVER,
      min_loyalty_points: null,
      discount_percent: 42, // operator's value — must survive
    });
    const repository = {
      deleteByNamesNotIn: jest.fn(async () => 0),
      findAll: jest.fn(async () => [legacy]),
      update: jest.fn(
        async (_id: Types.ObjectId, _input: Record<string, unknown>) => legacy,
      ),
      upsertByName: jest.fn(async () => legacy),
      deleteAll: jest.fn(),
    };

    await new TierConfigService(repository as never).seedDefaults();

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update.mock.calls[0][1]).toEqual({
      minLoyaltyPoints: 500,
    });
  });

  it('seeds a higher tier with a better reward than the base tier', async () => {
    // The ladder has to buy something, or there is no reason to climb it.
    const seeded: Array<Record<string, unknown>> = [];
    const repository = {
      deleteByNamesNotIn: jest.fn(async () => 0),
      findAll: jest.fn(async () => []),
      update: jest.fn(),
      upsertByName: jest.fn(async (input: Record<string, unknown>) => {
        seeded.push(input);
        return tierDoc();
      }),
    };

    await new TierConfigService(repository as never).seedDefaults();

    const byName = new Map(seeded.map((t) => [t.tierName as TierNameEnum, t]));
    const none = byName.get(TierNameEnum.NONE)!;
    const gold = byName.get(TierNameEnum.GOLD)!;

    expect(gold.washesPerRewardVoucher).toBeLessThan(
      none.washesPerRewardVoucher as number,
    );
    expect(gold.voucherRewardMultiplier).toBeGreaterThan(
      none.voucherRewardMultiplier as number,
    );
    expect(gold.voucherExpiryDays).toBeGreaterThan(
      none.voucherExpiryDays as number,
    );
    expect(gold.birthdayVoucherVnd).toBeGreaterThan(
      none.birthdayVoucherVnd as number,
    );
  });
});

describe('TierConfigService.update', () => {
  const makeService = (existing: Record<string, unknown>) =>
    new TierConfigService({
      findById: jest.fn(async () => existing),
      existsByPriorityLevelExcept: jest.fn(async () => false),
      update: jest.fn(async () => ({ ...existing })),
    } as never);

  it('rejects a floor above the ceiling, judged on the merged result', async () => {
    // Only the floor is being patched; it must still be checked against the
    // ceiling already stored.
    const service = makeService(tierDoc({ voucher_reward_ceil_vnd: 50_000 }));

    await expect(
      service.update(new Types.ObjectId().toString(), {
        voucherRewardFloorVnd: 80_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a coherent floor/ceiling pair', async () => {
    const service = makeService(tierDoc());

    await expect(
      service.update(new Types.ObjectId().toString(), {
        voucherRewardFloorVnd: 40_000,
        voucherRewardCeilVnd: 200_000,
      }),
    ).resolves.toBeTruthy();
  });
});
