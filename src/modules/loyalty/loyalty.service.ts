import { Types } from 'mongoose';
import {
  InternalServerErrorException,
  NotFoundException,
} from '../../common/exceptions';
import { LoyaltyAccountResponseDto } from '../../features/loyalty/dto/loyalty-account-response.dto';
import {
  LoyaltyTransactionListResponseDto,
  LoyaltyTransactionResponseDto,
} from '../../features/loyalty/dto/loyalty-transaction-response.dto';
import { LoyaltyTransactionTypeEnum } from '../../features/loyalty/types/loyalty-transaction-type.enum';
import { TierNameEnum } from '../../features/tier-config/types/tier-name.enum';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { TierConfigRepository } from '../tier-config/tier-config.repository';
import { VoucherService } from '../voucher/voucher.service';
import { LoyaltyAccountDocument } from './loyalty-account.model';
import { LoyaltyAccountRepository } from './loyalty-account.repository';
import { LoyaltyTransactionRepository } from './loyalty-transaction.repository';

// Penalty for not showing up to a confirmed booking.
const NO_SHOW_PENALTY_POINTS = 50;
// Number of VALID completed washes that earn a voucher.
const WASHES_PER_FREE_VOUCHER = 10;

// ─── Voucher economics (loyalty giveaway program) ───────────────────────────
const MIN_VALID_WASH_VND = 40_000;
const VOUCHER_GIVEAWAY_RATE = 0.05;
const VOUCHER_FLOOR_VND = 20_000;
const VOUCHER_CEIL_VND = 100_000;

// Business logic copied verbatim from features/loyalty/loyalty.service.ts; only
// DI + Nest exceptions + Logger were swapped out.
export class LoyaltyService {
  constructor(
    private readonly loyaltyRepository: LoyaltyAccountRepository,
    private readonly transactionRepository: LoyaltyTransactionRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly voucherService: VoucherService,
  ) {}

  /**
   * Ensures a loyalty account exists for the customer. Idempotent - returns the
   * existing account if already present. New accounts start at the None tier.
   */
  async ensureForCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument> {
    const existing = await this.loyaltyRepository.findByCustomerId(customerId);
    if (existing) {
      // Self-heal: accounts created under the previous 4-tier schema may still
      // reference a tier_config_id that no longer exists. Snap them to None.
      const linked = await this.tierConfigRepository.findById(
        existing.tier_config_id,
      );
      if (linked) return existing;

      const fallback = await this.tierConfigRepository.findByName(
        TierNameEnum.NONE,
      );
      if (!fallback) {
        throw new InternalServerErrorException(
          'None tier_config not seeded - restart app',
        );
      }
      const repaired = await this.loyaltyRepository.updateById(existing._id, {
        tierConfigId: fallback._id,
      });
      console.warn(
        `Loyalty account ${existing._id.toString()} pointed at missing tier - repaired to None`,
      );
      return repaired ?? existing;
    }

    const baseTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!baseTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded - restart app',
      );
    }

    const created = await this.loyaltyRepository.create({
      customerId: new Types.ObjectId(customerId),
      tierConfigId: baseTier._id,
    });
    console.log('Created loyalty account at None tier', {
      customerId: customerId.toString(),
    });
    return created;
  }

  async getForCustomer(customerId: string): Promise<LoyaltyAccountResponseDto> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      throw new NotFoundException(
        'Linked tier_config not found - DB inconsistent',
      );
    }
    return LoyaltyAccountResponseDto.fromDocument(account, tier.tier_name);
  }

  async getTierForCustomer(
    customerId: string,
  ): Promise<TierConfigDocument | null> {
    const account = await this.ensureForCustomer(customerId);
    return this.tierConfigRepository.findById(account.tier_config_id);
  }

  async listTransactions(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<LoyaltyTransactionListResponseDto> {
    const [docs, total] = await Promise.all([
      this.transactionRepository.findByCustomerPaginated(
        customerId,
        page,
        limit,
      ),
      this.transactionRepository.countByCustomer(customerId),
    ]);
    return {
      data: docs.map((d) => LoyaltyTransactionResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Awards points for a freshly COMPLETED order, increments wash counters,
   * mints a free-wash voucher when the 10-wash threshold trips, and recomputes
   * tier. Called by OrderService.markCompletedByWorkOrder.
   */
  async applyOrderCompleted(
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
    amountVnd: number,
    isVoucherEligibleService: boolean,
  ): Promise<void> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      console.error(
        `Loyalty account ${account._id.toString()} references missing tier`,
      );
      return;
    }

    const earned = Math.floor((amountVnd / 1000) * tier.points_per_1000_vnd);
    const newBalance = account.points_balance + earned;
    const newTotalWashes = account.total_successful_washes + 1;

    const isValidWash =
      isVoucherEligibleService && amountVnd >= MIN_VALID_WASH_VND;

    let washesAfterReward = account.successful_washes_toward_voucher;
    let spendAfterReward = account.spend_toward_voucher;
    let mintedVoucherId: Types.ObjectId | undefined;
    let mintedCap = 0;

    if (isValidWash) {
      washesAfterReward += 1;
      spendAfterReward += amountVnd;

      if (washesAfterReward >= WASHES_PER_FREE_VOUCHER) {
        mintedCap = Math.min(
          Math.max(
            Math.round(spendAfterReward * VOUCHER_GIVEAWAY_RATE),
            VOUCHER_FLOOR_VND,
          ),
          VOUCHER_CEIL_VND,
        );
        const voucher = await this.voucherService.grantFreeWash({
          customerId: new Types.ObjectId(customerId),
          discountCapVnd: mintedCap,
        });
        mintedVoucherId = voucher._id;
        washesAfterReward -= WASHES_PER_FREE_VOUCHER;
        spendAfterReward = 0;
      }
    }

    await this.loyaltyRepository.updateById(account._id, {
      pointsBalance: newBalance,
      successfulWashesTowardVoucher: washesAfterReward,
      spendTowardVoucher: spendAfterReward,
      totalSuccessfulWashes: newTotalWashes,
    });

    await this.transactionRepository.create({
      customerId: new Types.ObjectId(customerId),
      type: LoyaltyTransactionTypeEnum.EARN_COMPLETED,
      pointsDelta: earned,
      balanceAfter: newBalance,
      orderId,
      reason: `Earned ${earned} points from order ${orderId.toString()}`,
    });

    if (mintedVoucherId) {
      await this.transactionRepository.create({
        customerId: new Types.ObjectId(customerId),
        type: LoyaltyTransactionTypeEnum.VOUCHER_GRANTED,
        pointsDelta: 0,
        balanceAfter: newBalance,
        orderId,
        voucherId: mintedVoucherId,
        reason: `Voucher thưởng cap ${mintedCap.toLocaleString('vi-VN')}đ tại mốc ${WASHES_PER_FREE_VOUCHER} lượt hợp lệ`,
      });
    }

    await this.recomputeTierAndLog(
      account._id,
      new Types.ObjectId(customerId),
      newBalance,
      tier,
      orderId,
    );
  }

  /**
   * Penalises the customer for a NO_SHOW: deducts a fixed penalty (clamped at
   * 0), logs a transaction, and may demote tier.
   */
  async applyOrderNoShow(
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
  ): Promise<void> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      console.error(
        `Loyalty account ${account._id.toString()} references missing tier`,
      );
      return;
    }

    const deducted = Math.min(account.points_balance, NO_SHOW_PENALTY_POINTS);
    const newBalance = account.points_balance - deducted;

    await this.loyaltyRepository.updateById(account._id, {
      pointsBalance: newBalance,
    });

    await this.transactionRepository.create({
      customerId: new Types.ObjectId(customerId),
      type: LoyaltyTransactionTypeEnum.DEDUCT_NO_SHOW,
      pointsDelta: -deducted,
      balanceAfter: newBalance,
      orderId,
      reason: `Penalty for no-show on order ${orderId.toString()}`,
    });

    await this.recomputeTierAndLog(
      account._id,
      new Types.ObjectId(customerId),
      newBalance,
      tier,
      orderId,
    );
  }

  /**
   * Annual reset: zeroes points_balance and the voucher counters for every
   * account, demotes everyone to None, logs ANNUAL_RESET. Lifetime
   * total_successful_washes is preserved. Called once per year by the cron.
   */
  async annualReset(): Promise<{ resetCount: number }> {
    const noneTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!noneTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded - cannot run annual reset',
      );
    }

    const accounts = await this.loyaltyRepository.findAll();
    const now = new Date();
    let resetCount = 0;
    for (const account of accounts) {
      const previousTierId = account.tier_config_id;
      try {
        await this.loyaltyRepository.updateById(account._id, {
          pointsBalance: 0,
          successfulWashesTowardVoucher: 0,
          spendTowardVoucher: 0,
          tierConfigId: noneTier._id,
          lastAnnualResetAt: now,
        });
        await this.transactionRepository.create({
          customerId: account.customer_id,
          type: LoyaltyTransactionTypeEnum.ANNUAL_RESET,
          pointsDelta: -account.points_balance,
          balanceAfter: 0,
          previousTierConfigId: previousTierId,
          newTierConfigId: noneTier._id,
          reason: `Annual reset on ${now.toISOString()}`,
        });
        resetCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `Annual reset failed for accountId=${account._id.toString()} reason=${msg}`,
        );
      }
    }
    console.log(`Annual reset complete count=${resetCount}`);
    return { resetCount };
  }

  /**
   * Picks the highest active tier whose min_loyalty_points <= balance. If the
   * tier changes, persists it and writes a TIER_CHANGED audit transaction.
   */
  private async recomputeTierAndLog(
    accountId: Types.ObjectId,
    customerId: Types.ObjectId,
    balance: number,
    currentTier: TierConfigDocument,
    orderId: Types.ObjectId | undefined,
  ): Promise<void> {
    const tiers = await this.tierConfigRepository.findActive();
    // findActive returns ascending priority - pick the last one whose threshold
    // is satisfied so we land on the highest qualifying tier.
    let target: TierConfigDocument | null = null;
    for (const t of tiers) {
      if (balance >= t.min_loyalty_points) target = t;
    }
    if (!target || target._id.equals(currentTier._id)) return;

    await this.loyaltyRepository.updateById(accountId, {
      tierConfigId: target._id,
    });
    await this.transactionRepository.create({
      customerId,
      type: LoyaltyTransactionTypeEnum.TIER_CHANGED,
      pointsDelta: 0,
      balanceAfter: balance,
      orderId,
      previousTierConfigId: currentTier._id,
      newTierConfigId: target._id,
      reason: `Tier changed: ${currentTier.tier_name} → ${target.tier_name}`,
    });
    console.log(
      `Tier changed customerId=${customerId.toString()} ${currentTier.tier_name} → ${target.tier_name}`,
    );
  }
}
