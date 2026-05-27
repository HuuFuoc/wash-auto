import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TierConfigDocument } from '../tier-config/entities/tier-config.entity';
import { TierConfigRepository } from '../tier-config/repositories/tier-config.repository';
import { TierNameEnum } from '../tier-config/types/tier-name.enum';
import { VoucherService } from '../voucher/voucher.service';
import { LoyaltyAccountResponseDto } from './dto/loyalty-account-response.dto';
import {
  LoyaltyTransactionListResponseDto,
  LoyaltyTransactionResponseDto,
} from './dto/loyalty-transaction-response.dto';
import { LoyaltyAccountDocument } from './entities/loyalty-account.entity';
import { LoyaltyAccountRepository } from './repositories/loyalty-account.repository';
import { LoyaltyTransactionRepository } from './repositories/loyalty-transaction.repository';
import { LoyaltyTransactionTypeEnum } from './types/loyalty-transaction-type.enum';

// Penalty for not showing up to a confirmed booking. Kept here as a private
// constant — promote to a config table only if/when product needs it tunable.
const NO_SHOW_PENALTY_POINTS = 50;
// Number of completed washes that earn a free wash voucher.
const WASHES_PER_FREE_VOUCHER = 10;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly loyaltyRepository: LoyaltyAccountRepository,
    private readonly transactionRepository: LoyaltyTransactionRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly voucherService: VoucherService,
  ) {}

  /**
   * Ensures a loyalty account exists for the customer. Called on register
   * AND lazily on any read endpoint so old customers also receive one.
   * Idempotent — returns the existing account if already present. New
   * accounts start at the None tier.
   */
  async ensureForCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument> {
    const existing = await this.loyaltyRepository.findByCustomerId(customerId);
    if (existing) {
      // Self-heal: accounts created under the previous 4-tier schema may
      // still reference a tier_config_id that no longer exists (the seed
      // reset wiped legacy Member/Platinum). Snap them back to the new
      // None tier so reads do not throw a misleading 500.
      const linked = await this.tierConfigRepository.findById(
        existing.tier_config_id,
      );
      if (linked) return existing;

      const fallback = await this.tierConfigRepository.findByName(
        TierNameEnum.NONE,
      );
      if (!fallback) {
        throw new InternalServerErrorException(
          'None tier_config not seeded — restart app',
        );
      }
      const repaired = await this.loyaltyRepository.updateById(existing._id, {
        tierConfigId: fallback._id,
      });
      this.logger.warn(
        `Loyalty account ${existing._id.toString()} pointed at missing tier — repaired to None`,
      );
      return repaired ?? existing;
    }

    const baseTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!baseTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded — restart app',
      );
    }

    const created = await this.loyaltyRepository.create({
      customerId: new Types.ObjectId(customerId),
      tierConfigId: baseTier._id,
    });
    this.logger.log('Created loyalty account at None tier', {
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
        'Linked tier_config not found — DB inconsistent',
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
   * Awards points for a freshly COMPLETED order, increments the customer's
   * wash counters, mints a free-wash voucher when the 10-wash threshold trips,
   * and recomputes tier. Always logs a transaction so the audit trail covers
   * every point movement. Called by OrderService.markCompletedByWorkOrder.
   *
   * Idempotency is best-effort: callers should not invoke twice for the same
   * order. The COMPLETED state is terminal in the order state machine, so a
   * second invocation would only happen if upstream code regressed.
   */
  async applyOrderCompleted(
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
    amountVnd: number,
  ): Promise<void> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      this.logger.error(
        `Loyalty account ${account._id.toString()} references missing tier`,
      );
      return;
    }

    const earned = Math.floor((amountVnd / 1000) * tier.points_per_1000_vnd);
    const newBalance = account.points_balance + earned;
    const newTowardVoucher = account.successful_washes_toward_voucher + 1;
    const newTotalWashes = account.total_successful_washes + 1;

    let washesAfterReward = newTowardVoucher;
    let mintedVoucherId: Types.ObjectId | undefined;
    if (newTowardVoucher >= WASHES_PER_FREE_VOUCHER) {
      const voucher = await this.voucherService.grantFreeWash({
        customerId: new Types.ObjectId(customerId),
        reason: `Reward for ${WASHES_PER_FREE_VOUCHER} completed washes`,
      });
      mintedVoucherId = voucher._id;
      washesAfterReward = newTowardVoucher - WASHES_PER_FREE_VOUCHER;
    }

    await this.loyaltyRepository.updateById(account._id, {
      pointsBalance: newBalance,
      successfulWashesTowardVoucher: washesAfterReward,
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
        reason: `Free-wash voucher minted at ${WASHES_PER_FREE_VOUCHER}-wash threshold`,
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
   * Penalises the customer for a NO_SHOW: deducts a fixed penalty (clamped
   * at 0), logs a transaction, and may demote tier. Idempotent in spirit —
   * the order state machine has NO_SHOW as terminal so this is called once.
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
      this.logger.error(
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
   * Annual reset: zeroes points_balance and successful_washes_toward_voucher
   * for every account, demotes everyone to None, logs ANNUAL_RESET. Lifetime
   * total_successful_washes is preserved. Called once per year on Jan 1 by
   * LoyaltyResetCron.
   */
  async annualReset(): Promise<{ resetCount: number }> {
    const noneTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!noneTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded — cannot run annual reset',
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
        this.logger.error(
          `Annual reset failed for accountId=${account._id.toString()} reason=${msg}`,
        );
      }
    }
    this.logger.log(`Annual reset complete count=${resetCount}`);
    return { resetCount };
  }

  /**
   * Picks the highest active tier whose min_loyalty_points <= balance. If the
   * tier changes, persists it on the account and writes a TIER_CHANGED audit
   * transaction so the customer can trace their movement up and down the
   * ladder. Otherwise this is a no-op.
   */
  private async recomputeTierAndLog(
    accountId: Types.ObjectId,
    customerId: Types.ObjectId,
    balance: number,
    currentTier: TierConfigDocument,
    orderId: Types.ObjectId | undefined,
  ): Promise<void> {
    const tiers = await this.tierConfigRepository.findActive();
    // findActive returns ascending priority — pick the last one whose
    // threshold is satisfied so we land on the highest qualifying tier.
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
    this.logger.log(
      `Tier changed customerId=${customerId.toString()} ${currentTier.tier_name} → ${target.tier_name}`,
    );
  }
}
